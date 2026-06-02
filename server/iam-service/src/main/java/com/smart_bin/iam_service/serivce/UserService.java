package com.smart_bin.iam_service.serivce;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smart_bin.core.common.Constants;
import com.smart_bin.core.common.EmailType;
import com.smart_bin.core.common.UserRole;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.iam_service.common.TokenType;
import com.smart_bin.iam_service.common.UserState;
import com.smart_bin.iam_service.dto.auth.request.ResendVerificationRequest;
import com.smart_bin.iam_service.dto.auth.request.UpdateUserStateRequest;
import com.smart_bin.iam_service.dto.user.request.CreateUserRequest;
import com.smart_bin.iam_service.dto.user.request.UpdateUserByTenantRequest;
import com.smart_bin.iam_service.dto.user.request.UpdateUserRequest;
import com.smart_bin.iam_service.dto.user.response.UserDto;
import com.smart_bin.iam_service.entity.Tenant;
import com.smart_bin.iam_service.entity.User;
import com.smart_bin.iam_service.exception.AuthErrorCode;
import com.smart_bin.iam_service.exception.UserErrorCode;
import com.smart_bin.iam_service.mapper.TenantMapper;
import com.smart_bin.iam_service.mapper.UserMapper;
import com.smart_bin.iam_service.repository.TenantRepository;
import com.smart_bin.iam_service.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {
    private final UserRepository userRepository;
    private final KeycloakService keycloakService;
    private final UserMapper mapper;
    private final KafkaService kafkaService;
    private final ObjectMapper objectMapper;
    private final CacheManager cacheManager;

    private final TenantRepository tenantRepository;
    private final TenantMapper tenantMapper;

    @Value("${app.admin.root-email}")
    private String rootEmail;

    @Value("${app.tenant.default-email}")
    private String defaultTenantEmail;

    @Value("${app.internal.secret:SUPER_SECRET_INTERNAL_KEY}")
    private String internalSecret;

    private static final SecureRandom random = new SecureRandom();

    @Transactional
    public UserDto createUser(CreateUserRequest request, String tenantId, boolean isTenant) {
        // 1. Khởi tạo/tái sử dụng thực thể User & Đăng ký trên Keycloak
        User user = prepareUserEntity(request);

        // 2. Xác định và gán Tenant ID tương ứng
        String assignedTenantId = assignTenant(user, tenantId, isTenant);

        // 3. Thiết lập trạng thái hoạt động & Token xác thực email
        configureUserStatus(user, isTenant);

        User savedUser = userRepository.save(user);

        // 4. Đồng bộ thuộc tính lên Keycloak và gửi mail thông báo nếu cần
        syncKeycloakAndNotify(savedUser, assignedTenantId, isTenant);

        return mapper.toDto(savedUser);
    }

    @Transactional
    public void syncGoogleUser(String keycloakId, String email, String name, String avatarUrl) {
        Optional<User> existingUserOpt = userRepository.findByKeycloakId(keycloakId);

        if (existingUserOpt.isPresent()) {
            User existingUser = existingUserOpt.get();
            // Nếu User trước đó bị khóa/xóa, cho phép Google đăng nhập mở lại tài khoản
            if (!existingUser.isActive()) {
                existingUser.setActive(true);
                existingUser.setState(UserState.ACTIVE);
                keycloakService.enableUser(keycloakId);
                userRepository.save(existingUser);
            }
            return;
        }

        Tenant defaultTenant = tenantRepository.findByEmail(defaultTenantEmail)
                .orElseThrow(() -> new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Hệ thống chưa cấu hình Default Tenant"));


        // Lần đầu đăng nhập bằng Google
        User newUser = new User();
        newUser.setKeycloakId(keycloakId);
        newUser.setEmail(email);
        newUser.setName(name);
        newUser.setAvatarUrl(avatarUrl);
        newUser.setEmailVerified(true);
        newUser.setTenantId(defaultTenant.getKeycloakId());
        newUser.setState(UserState.ACTIVE);
        newUser.setActive(true);
        newUser.setRole(UserRole.USER);
        userRepository.save(newUser);

        keycloakService.updatePassword(keycloakId, generateRandomPassword());
        keycloakService.updateUserAttribute(keycloakId, "user_state", UserState.ACTIVE.name());

        sendEmailToUser(newUser.getEmail(), newUser.getName(), null, EmailType.WELCOME);
    }

    public Page<UserDto> getUsers(Long page, Long size){
        int pageIndex = (page != null && page > 0) ? page.intValue() - 1 : 0;
        int pageSize = (size != null && size > 0) ? size.intValue() : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        // Lấy tất cả user (Có thể thêm query chỉ lấy active tùy nghiệp vụ)
        return userRepository.findAll(pageable).map(mapper::toDto);
    }

    @Transactional
    public String verifyEmail(String token) {
        User user = userRepository.findByActionTokenAndActiveTrue(token)
                .orElseThrow(() -> new ApiException(AuthErrorCode.INVALID_TOKEN));

        if (user.isEmailVerified()) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Email already verified");
        }

        if (System.currentTimeMillis() > user.getActionTokenExpiry()) {
            throw new ApiException(AuthErrorCode.INVALID_TOKEN);
        }

        user.setEmailVerified(true);
        user.setActionToken(null);
        user.setActionTokenExpiry(null);
        user.setState(UserState.ACTIVE);

        userRepository.save(user);
        keycloakService.enableUser(user.getKeycloakId());
        keycloakService.updateUserAttribute(user.getKeycloakId(), "user_state", UserState.ACTIVE.name());

        sendEmailToUser(user.getEmail(), user.getName(), null, EmailType.WELCOME);

        return "Email verified successfully";
    }

//    @Cacheable(value = "usersByKcId", key = "#keycloakId")
    public Object getUserByKeycloakId(String keycloakId) {
        Optional<Tenant> tenantOpt = tenantRepository.findByKeycloakId(keycloakId).filter(Tenant::isActive);
        if (tenantOpt.isPresent()) {
            return tenantMapper.toDto(tenantOpt.get());
        }

        Optional<User> userOpt = userRepository.findByKeycloakIdAndActiveTrue(keycloakId);
        if (userOpt.isPresent()) {
            return mapper.toDto(userOpt.get());
        }

        throw new ApiException(UserErrorCode.USER_NOT_FOUND, "Không tìm thấy thông tin tài khoản.");
    }

    @Transactional
    public UserDto updateUserStateById(String userId, UpdateUserStateRequest request) {
        User targetUser = userRepository.findById(parseUUID(userId))
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        if (targetUser.getEmail().equalsIgnoreCase(rootEmail)) {
            throw new ApiException(AuthErrorCode.CANNOT_MODIFY_ROOT_ADMIN);
        }

        UserState newState = request.state();

        // Khôi phục tài khoản (Reactivate)
        if (newState == UserState.ACTIVE && !targetUser.isActive()) {
            targetUser.setActive(true);
            keycloakService.enableUser(targetUser.getKeycloakId());
        }
        // Xóa mềm tài khoản
        else if (newState == UserState.DELETED && targetUser.isActive()) {
            targetUser.setActive(false);
            keycloakService.disableUser(targetUser.getKeycloakId());
        }
        // Cập nhật trạng thái thông thường
        else if (newState == UserState.BLOCKED) {
            keycloakService.disableUser(targetUser.getKeycloakId());
        } else if (newState == UserState.ACTIVE) {
            keycloakService.enableUser(targetUser.getKeycloakId());
        }

        targetUser.setState(newState);
        return mapper.toDto(userRepository.save(targetUser));
    }

    @Transactional
    public Object updateUser(String keycloakId, UpdateUserRequest request) {
        if (request.avatarUrl() != null && !request.avatarUrl().isBlank()) {
            if (!request.avatarUrl().startsWith("https://s3.kvbhust.id.vn")) {
                throw new ApiException(UserErrorCode.INVALID_AVATAR_URL);
            }
        }

        // 1. Xử lý cập nhật nếu là Normal User
        Optional<User> userOpt = userRepository.findByKeycloakIdAndActiveTrue(keycloakId);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            mapper.updateUserFromRequest(request, user);
            User savedUser = userRepository.save(user);

            keycloakService.updateUserInfo(keycloakId, savedUser.getName());

            return mapper.toDto(savedUser);
        }

        // 2. Xử lý cập nhật nếu là Tenant (Khách hàng doanh nghiệp / Admin)
        Optional<Tenant> tenantOpt = tenantRepository.findByKeycloakId(keycloakId).filter(Tenant::isActive);
        if (tenantOpt.isPresent()) {
            Tenant tenant = tenantOpt.get();
            if (request.name() != null) tenant.setName(request.name().trim());
            if (request.avatarUrl() != null) tenant.setAvatarUrl(request.avatarUrl());

            Tenant savedTenant = tenantRepository.save(tenant);

            keycloakService.updateUserInfo(keycloakId, savedTenant.getName());
            return tenantMapper.toDto(savedTenant);
        }

        throw new ApiException(UserErrorCode.USER_NOT_FOUND, "Không tìm thấy thông tin tài khoản để cập nhật.");
    }

    @Transactional
    public UserDto updateUserByTenant(String targetUserId, String tenantKeycloakId, UpdateUserByTenantRequest request) {
        User targetUser = userRepository.findByIdAndActiveTrue(parseUUID(targetUserId))
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        if (!targetUser.getTenantId().equals(tenantKeycloakId)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Bạn không có quyền cập nhật người dùng của tổ chức khác.");
        }

        if (targetUser.getEmail().equalsIgnoreCase(rootEmail)) {
            throw new ApiException(AuthErrorCode.CANNOT_MODIFY_ROOT_ADMIN);
        }

        boolean needSyncKeycloakInfo = false;
        boolean needSyncKeycloakState = false;

        if (request.name() != null && !request.name().isBlank()) {
            targetUser.setName(request.name().trim());
            needSyncKeycloakInfo = true;
        }

        if (request.avatarUrl() != null && !request.avatarUrl().isBlank()) {
            if (!request.avatarUrl().startsWith("https://s3.kvbhust.id.vn")) {
                throw new ApiException(UserErrorCode.INVALID_AVATAR_URL);
            }
            targetUser.setAvatarUrl(request.avatarUrl());
        }

        if (request.state() != null && targetUser.getState() != request.state()) {
            UserState newState = request.state();

            if (newState == UserState.BLOCKED || newState == UserState.DELETED) {
                keycloakService.disableUser(targetUser.getKeycloakId());
            } else if (newState == UserState.ACTIVE) {
                keycloakService.enableUser(targetUser.getKeycloakId());
            }

            if (newState == UserState.DELETED) {
                targetUser.setActive(false);
            }

            targetUser.setState(newState);
            needSyncKeycloakState = true;
        }

        User savedUser = userRepository.save(targetUser);

        if (needSyncKeycloakInfo) {
            keycloakService.updateUserInfo(targetUser.getKeycloakId(), targetUser.getName());
        }
        if (needSyncKeycloakState) {
            keycloakService.updateUserAttribute(targetUser.getKeycloakId(), "user_state", targetUser.getState().name());
        }

        return mapper.toDto(savedUser);
    }

    @Transactional
    public void deleteUserById(String targetUserId) {
        User targetUser = userRepository.findByIdAndActiveTrue(parseUUID(targetUserId))
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        if (targetUser.getEmail().equalsIgnoreCase(rootEmail)) {
            throw new ApiException(AuthErrorCode.CANNOT_MODIFY_ROOT_ADMIN);
        }

        targetUser.setActive(false); // Đánh dấu xóa mềm
        targetUser.setState(UserState.DELETED);
        userRepository.save(targetUser);

        keycloakService.disableUser(targetUser.getKeycloakId()); // Chỉ disable chứ không xóa hẳn trên Keycloak để còn record

        var cache = cacheManager.getCache("usersByKcId");
        if (cache != null) {
            cache.evict(targetUser.getKeycloakId());
        }
    }

    @Transactional
    public void resendVerificationEmail(ResendVerificationRequest request) {
        User user = userRepository.findByEmailAndActiveTrue(request.email())
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        if (user.isEmailVerified()) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Email already verified");
        }

        user.setActionToken(UUID.randomUUID().toString());
        user.setTokenType(TokenType.VERIFY_EMAIL);
        user.setActionTokenExpiry(System.currentTimeMillis() + Constants.VERIFICATION_TOKEN_EXPIRY);

        userRepository.save(user);

        sendEmailToUser(user.getEmail(), user.getName(), user.getActionToken(), EmailType.VERIFICATION);
    }

    public void verifyStatus(String keycloakId) {
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        if (user.getState() == UserState.PENDING) {
            if (!user.isEmailVerified()) {
                throw new ApiException(AuthErrorCode.UNVERIFIED_EMAIL);
            } else {
                throw new ApiException(AuthErrorCode.INCOMPLETE_PROFILE);
            }
        }
    }

    public void sendEmailToUser(String email, String fullName, String activationCode, EmailType emailType) {
        ObjectNode emailData = objectMapper.createObjectNode();
        emailData.put("email", email);
        emailData.put("fullName", fullName);
        if (activationCode != null) {
            emailData.put("activationCode", activationCode);
        }
        kafkaService.sendEmailToUser(emailData, emailType);
    }

    public Object getUserByIdInternal(String userId, String internalSecret) {
        if (!this.internalSecret.equals(internalSecret)) {
            throw new ApiException(AuthErrorCode.FORBIDDEN_ACCESS, "Invalid internal secret");
        }

        Optional<Tenant> tenantOpt = tenantRepository.findByKeycloakId(userId);
        if (tenantOpt.isPresent()) {
            return tenantMapper.toDto(tenantOpt.get());
        }

        User user = userRepository.findById(parseUUID(userId))
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND, "Không tìm thấy người dùng hoặc tổ chức với ID này"));

        return mapper.toDto(user);
    }

    private String generateRandomPassword() {
        String upperCases = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        String lowerCases = "abcdefghijkmnpqrstuvwxyz";
        String numbers = "23456789";
        String specials = "!@#$%";
        StringBuilder password = new StringBuilder(Constants.PASSWORD_LENGTH);
        password.append(upperCases.charAt(random.nextInt(upperCases.length())));
        password.append(lowerCases.charAt(random.nextInt(lowerCases.length())));
        password.append(numbers.charAt(random.nextInt(numbers.length())));
        password.append(specials.charAt(random.nextInt(specials.length())));
        for (int i = 4; i < Constants.PASSWORD_LENGTH; i++) {
            password.append(Constants.CHARACTERS.charAt(random.nextInt(Constants.CHARACTERS.length())));
        }
        return password.toString();
    }

    private User prepareUserEntity(CreateUserRequest request) {
        User user = userRepository.findByEmail(request.email()).orElse(null);

        if (user != null) {
            if (user.isActive()) {
                throw new ApiException(UserErrorCode.USER_ALREADY_EXISTED);
            }
            try {
                keycloakService.deleteUser(user.getKeycloakId());
            } catch (Exception ignored) {
                log.warn("Keycloak user not found for deletion during recreation: {}", user.getKeycloakId());
            }
            user.setActive(true);
            user.setName(request.name());
        } else {
            user = mapper.toEntity(request);
        }

        user.setKeycloakId(keycloakService.createUser(request));
        user.setRole(UserRole.USER);
        return user;
    }

    private String assignTenant(User user, String tenantId, boolean isTenant) {
        if (isTenant && tenantId != null) {
            user.setTenantId(tenantId);
            return tenantId;
        }

        Tenant defaultTenant = tenantRepository.findByEmail(defaultTenantEmail)
                .orElseThrow(() -> new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Hệ thống chưa cấu hình Default Tenant"));

        String assignedId = defaultTenant.getKeycloakId();
        user.setTenantId(assignedId);
        return assignedId;
    }

    private void configureUserStatus(User user, boolean isTenant) {
        if (isTenant) {
            user.setState(UserState.ACTIVE);
            user.setEmailVerified(true);
            user.setActionToken(null);
            user.setActionTokenExpiry(null);
            user.setTokenType(null);

            keycloakService.enableUser(user.getKeycloakId());
        } else {
            user.setState(UserState.PENDING);
            user.setEmailVerified(false);
            user.setActionToken(UUID.randomUUID().toString());
            user.setActionTokenExpiry(System.currentTimeMillis() + Constants.VERIFICATION_TOKEN_EXPIRY);
            user.setTokenType(TokenType.VERIFY_EMAIL);
        }
    }

    private void syncKeycloakAndNotify(User user, String assignedTenantId, boolean isTenant) {
        keycloakService.updateUserAttribute(user.getKeycloakId(), "user_state", user.getState().name());

        if (assignedTenantId != null) {
            keycloakService.updateUserAttribute(user.getKeycloakId(), "tenant_id", assignedTenantId);
        }

        if (!isTenant) {
            sendEmailToUser(user.getEmail(), user.getName(), user.getActionToken(), EmailType.VERIFICATION);
        }
    }

    private UUID parseUUID(String id) {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid ID format");
        }
    }
}