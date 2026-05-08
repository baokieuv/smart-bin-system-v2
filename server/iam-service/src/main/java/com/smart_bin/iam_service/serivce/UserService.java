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
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;

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
    private final CacheManager cacheManager;

    @Value("${app.admin.root-email}")
    private String rootEmail;

    @Transactional
    public UserDto createUser(CreateUserRequest request) {
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

            String newKeycloakId = keycloakService.createUser(request);
            user.setActive(true);
            user.setKeycloakId(newKeycloakId);
            user.setFirstName(request.firstName());
            user.setLastName(request.lastName());
        } else {
            String keycloakUserId = keycloakService.createUser(request);
            user = mapper.toEntity(request);
            user.setKeycloakId(keycloakUserId);
        }

        user.setState(UserState.PENDING);
        user.setEmailVerified(false);
        user.setActionToken(UUID.randomUUID().toString());
        user.setActionTokenExpiry(System.currentTimeMillis() + Constants.VERIFICATION_TOKEN_EXPIRY);
        user.setTokenType(TokenType.VERIFY_EMAIL);

        User savedUser = userRepository.save(user);

        sendEmailViaKafka(savedUser.getEmail(), savedUser.getFirstName(), savedUser.getActionToken(), EmailType.VERIFICATION);
        keycloakService.updateUserAttribute(user.getKeycloakId(), "user_state", UserState.PENDING.name());

        return mapper.toDto(savedUser);
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

        sendEmailViaKafka(user.getEmail(), user.getFirstName(), null, EmailType.WELCOME);

        return "Email verified successfully";
    }

    @Cacheable(value = "users", key = "#userId")
    public UserDto getUserById(String userId) {
        UUID uuid;
        try {
            uuid = UUID.fromString(userId);
        } catch (IllegalArgumentException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Định dạng ID không hợp lệ");
        }

        User user = userRepository.findByIdAndActiveTrue(uuid)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        return mapper.toDto(user);
    }

    @Cacheable(value = "usersByKcId", key = "#keycloakId")
    public UserDto getUserByKeycloakId(String keycloakId) {
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        return mapper.toDto(user);
    }

    @Transactional
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
        if (user.getFirstName() == null || user.getFirstName().trim().isEmpty()) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Tên không được để trống.");
        }

        User savedUser = userRepository.save(user);
        keycloakService.updateUserInfo(keycloakId, savedUser.getFirstName(), savedUser.getLastName());

        return mapper.toDto(savedUser);
    }

    @Transactional
    @CacheEvict(value = "users", key = "#targetUserId")
    public void deleteUserById(String actorId, String targetUserId) {
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

        targetUser.setActive(false);
        targetUser.setState(UserState.DELETED);
        userRepository.save(targetUser);

        keycloakService.deleteUser(targetUser.getKeycloakId());

        // Xóa cache thủ công bằng CacheManager để khắc phục lỗi SpEL
        var cache = cacheManager.getCache("usersByKcId");
        if (cache != null) {
            cache.evict(targetUser.getKeycloakId());
        }

        log.info("Super_Admin (Actor ID: {}) đã xóa User (Target ID: {})", actorId, targetUserId);
    }

    @Transactional // Bổ sung cho an toàn mặc dù chỉ thay đổi trên Keycloak (tránh cache desync)
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

        // Đảm bảo cache usersByKcId cũng bị xóa vì vai trò đã thay đổi
        var cache = cacheManager.getCache("usersByKcId");
        if (cache != null) {
            cache.evict(targetUser.getKeycloakId());
        }

        log.info("Super_Admin (Actor ID: {}) đã cấp quyền '{}' cho User (Target ID: {})", actorId, newRole.name(), targetUserId);
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

        sendEmailViaKafka(user.getEmail(), user.getFirstName(), user.getActionToken(), EmailType.VERIFICATION);
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

    /**
     * Helper method để gom chung logic tạo payload và gửi Kafka
     */
    private void sendEmailViaKafka(String email, String fullName, String activationCode, EmailType emailType) {
        ObjectNode emailData = objectMapper.createObjectNode();
        emailData.put("email", email);
        emailData.put("fullName", fullName);
        if (activationCode != null) {
            emailData.put("activationCode", activationCode);
        }
        kafkaService.sendEmailToUser(emailData, emailType);
    }
}