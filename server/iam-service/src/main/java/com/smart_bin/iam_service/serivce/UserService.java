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
import com.smart_bin.iam_service.dto.user.request.CreateUserRequest;
import com.smart_bin.iam_service.dto.user.request.UpdateUserRequest;
import com.smart_bin.iam_service.dto.user.response.UserDto;
import com.smart_bin.iam_service.entity.User;
import com.smart_bin.iam_service.exception.AuthErrorCode;
import com.smart_bin.iam_service.exception.UserErrorCode;
import com.smart_bin.iam_service.mapper.UserMapper;
import com.smart_bin.iam_service.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.Objects;
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

    @Value("${app.admin.root-email}")
    private String rootEmail;

    @Transactional
    public UserDto createUser(CreateUserRequest request) {
        // 1. Tìm user hoặc khởi tạo mới
        User user = userRepository.findByEmail(request.email()).orElse(null);

        if (user != null) {
            // Nếu user đã tồn tại và đang active -> Báo lỗi
            if (user.isActive()) {
                throw new ApiException(UserErrorCode.USER_ALREADY_EXISTED);
            }

            try {
                keycloakService.deleteUser(user.getKeycloakId());
            } catch (Exception ignored) {
                // Ignore nếu user không tồn tại trên Keycloak
            }

            String newKeycloakId = keycloakService.createUser(request);

            // Nếu user tồn tại nhưng inactive -> Kích hoạt lại và update thông tin mới
            user.setActive(true);
            user.setKeycloakId(newKeycloakId);
            user.setFirstName(request.firstName());
            user.setLastName(request.lastName());
        } else {
            String keycloakUserId = keycloakService.createUser(request);

            user = mapper.toEntity(request);
            user.setKeycloakId(keycloakUserId);
        }

        // 2. Cấu hình lại các thông số xác thực
        user.setState(UserState.PENDING);
        user.setEmailVerified(false);
        user.setActionToken(UUID.randomUUID().toString());
        user.setActionTokenExpiry(System.currentTimeMillis() + Constants.VERIFICATION_TOKEN_EXPIRY);
        user.setTokenType(TokenType.VERIFY_EMAIL);

        // 3. Lưu vào Database
        User savedUser = userRepository.save(user);

        // 4. Gửi email xác nhận
        ObjectNode emailData = objectMapper.createObjectNode();
        emailData.put("email", savedUser.getEmail());
        emailData.put("fullName", savedUser.getFirstName());
        emailData.put("activationCode", savedUser.getActionToken());

        // Gọi KafkaService để gửi
        kafkaService.sendEmailToUser(emailData, EmailType.VERIFICATION);

        keycloakService.updateUserAttribute(user.getKeycloakId(), "user_state", "PENDING");


        // 5. Trả về DTO
        return mapper.toDto(savedUser);
    }

    @Transactional
    public String verifyEmail(String token) {
        User user = userRepository.findByActionTokenAndActiveTrue(token)
                .orElseThrow(() -> new ApiException(AuthErrorCode.INVALID_TOKEN));

        if (user.isEmailVerified()) {
            throw new RuntimeException("Email already verified");
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

        keycloakService.updateUserAttribute(user.getKeycloakId(), "user_state", "ACTIVE");

        // 4. Gửi email welcome
        ObjectNode emailData = objectMapper.createObjectNode();
        emailData.put("email", user.getEmail());
        emailData.put("fullName", user.getFirstName());

        // Gọi KafkaService để gửi
        kafkaService.sendEmailToUser(emailData, EmailType.WELCOME);

        return "Email verified successfully";
    }

    @Cacheable(value = "users", key = "#userId")
    public UserDto getUserById(String userId) {
        UUID uuid = UUID.fromString(userId);

        User user = userRepository.findByIdAndActiveTrue(uuid)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        return mapper.toDto(user);
    }

    @Cacheable(value = "usersByKcId", key = "#keycloakId")
    public UserDto getUserByKeycloakId(String keycloakId){
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        return mapper.toDto(user);
    }

    @Caching(put = {
            @CachePut(value = "usersByKcId", key = "#keycloakId"),
            @CachePut(value = "users", key = "#result.id.toString()")
    })
    public UserDto updateUser(String keycloakId, UpdateUserRequest request) {
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        if (request.avatarUrl() != null && !request.avatarUrl().isBlank()) {
            if (!request.avatarUrl().startsWith("https://s3.kvbhust.id.vn")) {
                throw new ApiException(CoreErrorCode.BAD_REQUEST, "Avatar URL không hợp lệ");
            }
        }

        mapper.updateUserFromRequest(request, user);
        if (user.getFirstName() == null || user.getFirstName().isEmpty()) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Tên không được để trống.");
        }

        User savedUser = userRepository.save(user);
        keycloakService.updateUserInfo(keycloakId, savedUser.getFirstName(), savedUser.getLastName());

        return mapper.toDto(savedUser);
    }

    @Caching(evict = {
            @CacheEvict(value = "users", key = "#targetUserId"),
            @CacheEvict(value = "usersByKcId", key = "#targetUser.keycloakId")
    })
    @Transactional
    public void deleteUserById(String actorId, String targetUserId) {
        // 1. Tìm user mục tiêu bằng UUID trong Database
        UUID uuid;
        try {
            uuid = UUID.fromString(targetUserId);
        } catch (IllegalArgumentException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Định dạng ID không hợp lệ");
        }

        User targetUser = userRepository.findByIdAndActiveTrue(uuid)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        if (targetUser.getKeycloakId().equals(actorId)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Bạn không thể tự xóa tài khoản của chính mình.");
        }

        if (targetUser.getEmail().equalsIgnoreCase(rootEmail)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Tài khoản Root của hệ thống là bất khả xâm phạm.");
        }

        // 4. Xóa mềm trong DB
        targetUser.setActive(false);
        targetUser.setState(UserState.DELETED);
        userRepository.save(targetUser);

        // 5. Xóa cứng trên Keycloak
        keycloakService.deleteUser(targetUser.getKeycloakId());

        log.info("Super_Admin (Actor ID: {}) đã xóa User (Target ID: {})", actorId, targetUserId);
    }

    @CacheEvict(value = "users", key = "#targetUserId")
    public void updateUserRole(String actorId, String targetUserId, UserRole newRole) {
        User targetUser = userRepository.findByIdAndActiveTrue(UUID.fromString(targetUserId))
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        if (targetUser.getKeycloakId().equals(actorId)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Bạn không thể tự thay đổi hoặc hạ quyền của chính mình.");
        }

        if (targetUser.getEmail().equalsIgnoreCase(rootEmail)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Tài khoản Root của hệ thống là bất khả xâm phạm.");
        }

        keycloakService.updateRealmRole(targetUser.getKeycloakId(), newRole);

        log.info("Super_Admin (Actor ID: {}) đã cấp quyền '{}' cho User (Target ID: {})", actorId, newRole.name(), targetUserId);
    }

    public void resendVerificationEmail(ResendVerificationRequest request) {
        User user = userRepository.findByEmailAndActiveTrue(request.email())
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (user.isEmailVerified()) {
            throw new RuntimeException("Email already verified");
        }

        user.setActionToken(UUID.randomUUID().toString());
        user.setTokenType(TokenType.VERIFY_EMAIL);
        user.setActionTokenExpiry(System.currentTimeMillis() + Constants.VERIFICATION_TOKEN_EXPIRY);

        userRepository.save(user);

        // 4. Gửi email xác nhận
        ObjectNode emailData = objectMapper.createObjectNode();
        emailData.put("email", user.getEmail());
        emailData.put("fullName", user.getFirstName());
        emailData.put("activationCode", user.getActionToken());

        // Gọi KafkaService để gửi
        kafkaService.sendEmailToUser(emailData, EmailType.VERIFICATION);
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
}
