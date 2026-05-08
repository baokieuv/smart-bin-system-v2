package com.smart_bin.iam_service.serivce;

import com.auth0.jwt.JWT;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smart_bin.core.common.Constants;
import com.smart_bin.core.common.EmailType;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.iam_service.common.TokenType;
import com.smart_bin.iam_service.common.UserState;
import com.smart_bin.iam_service.dto.auth.request.*;
import com.smart_bin.iam_service.dto.auth.response.TokenResponse;
import com.smart_bin.iam_service.entity.User;
import com.smart_bin.iam_service.exception.AuthErrorCode;
import com.smart_bin.iam_service.exception.UserErrorCode;
import com.smart_bin.iam_service.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {
    private final KeycloakService keycloakService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;
    private final KafkaService kafkaService;

    private static final SecureRandom random = new SecureRandom();

    public TokenResponse loginPassword(LoginRequest request) {
        User user = userRepository.findByEmailAndActiveTrue(request.username())
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        if (!user.isEmailVerified()) {
            throw new ApiException(AuthErrorCode.UNVERIFIED_EMAIL, "Email not verified. Please check your email for verification link.");
        }

        return keycloakService.login(request);
    }

    public void logout(String refreshToken) {
        keycloakService.logout(refreshToken);
    }

    @Transactional
    public TokenResponse loginGoogle(String googleToken) {
        String email = null;
        try {
            var googleJwt = JWT.decode(googleToken);
            email = googleJwt.getClaim("email").asString();
            String googleSubjectId = googleJwt.getSubject();

            var kcUser = keycloakService.getUserByEmail(email);

            if (kcUser != null) {
                keycloakService.linkIdentityProvider(kcUser.getId(), "google", googleSubjectId, email);
            }
        } catch (Exception e) {
            log.warn("Failed to link Google identity provider for email: {}", email, e);
        }

        // 1. Đổi token Google lấy token Keycloak
        TokenResponse keycloakToken = keycloakService.exchangeGoogleToken(googleToken);

        // 2. Giải mã JWT của Keycloak để lấy thông tin user
        var jwt = JWT.decode(keycloakToken.accessToken());
        String keycloakId = jwt.getSubject();
        String jwtEmail = jwt.getClaim("email").asString();
        String firstName = jwt.getClaim("given_name").asString();
        String lastName = jwt.getClaim("family_name").asString();
        String avatarUrl = jwt.getClaim("picture").asString();

        // 3. Kiểm tra user trong Database nội bộ
        Optional<User> existingUser = userRepository.findByKeycloakIdAndActiveTrue(keycloakId);

        if (existingUser.isEmpty()) {
            // Lần đầu đăng nhập bằng Google -> Tạo mới user trong DB nội bộ
            User newUser = new User();
            newUser.setKeycloakId(keycloakId);
            newUser.setEmail(jwtEmail);
            newUser.setFirstName(firstName);
            newUser.setLastName(lastName);
            newUser.setAvatarUrl(avatarUrl);
            newUser.setEmailVerified(true); // Google đã verify
            newUser.setState(UserState.ACTIVE); // Đánh dấu ACTIVE
            userRepository.save(newUser);

            keycloakService.updatePassword(keycloakId, generateRandomPassword());
            keycloakService.updateUserAttribute(keycloakId, "user_state", UserState.ACTIVE.name());

            // 4. Gửi email welcome
            sendEmailViaKafka(newUser.getEmail(), newUser.getFirstName(), null, EmailType.WELCOME);
        }

        return keycloakToken;
    }

    @Transactional
    public void completeProfile(String userId, String newPassword) {
        User user = userRepository.findByKeycloakIdAndActiveTrue(userId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        // Cập nhật mật khẩu lên Keycloak
        keycloakService.updatePassword(userId, newPassword);

        // Cập nhật trạng thái DB thành ACTIVE
        user.setState(UserState.ACTIVE);
        userRepository.save(user);

        // Đồng bộ trạng thái lên Keycloak
        keycloakService.updateUserAttribute(user.getKeycloakId(), "user_state", UserState.ACTIVE.name());

        // Gửi email welcome
        sendEmailViaKafka(user.getEmail(), user.getFirstName(), null, EmailType.WELCOME);
    }

    public TokenResponse refreshToken(RefreshTokenRequest request) {
        return keycloakService.refreshAccessToken(request.refreshToken());
    }

    @Transactional
    public String changePassword(String keycloakId, ChangePasswordRequest request) {
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        if (request.currentPassword().equals(request.newPassword())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Mật khẩu mới không được trùng với mật khẩu hiện tại.");
        }

        if (!request.newPassword().equals(request.confirmPassword())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Mật khẩu xác nhận không khớp.");
        }

        try {
            LoginRequest loginRequest = new LoginRequest(user.getEmail(), request.currentPassword(), null);
            keycloakService.login(loginRequest);
        } catch (Exception e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Mật khẩu hiện tại không chính xác.");
        }

        keycloakService.updatePassword(keycloakId, request.newPassword());
        keycloakService.logoutAllSessions(keycloakId);

        return "Change password successfully.";
    }

    @Transactional
    public String requestPasswordReset(ResetPasswordRequest request) {
        User user = userRepository.findByEmailAndActiveTrue(request.email())
                .orElse(null);

        if (user != null) {
            String resetToken = UUID.randomUUID().toString();

            user.setActionToken(resetToken);
            user.setActionTokenExpiry(System.currentTimeMillis() + (15 * 60 * 1000));
            user.setTokenType(TokenType.RESET_PASSWORD);

            userRepository.save(user);

            sendEmailViaKafka(user.getEmail(), user.getFirstName(), resetToken, EmailType.RESET_PASSWORD);
        }

        return "Nếu email hợp lệ và đã được xác thực, một hướng dẫn đặt lại mật khẩu đã được gửi đến bạn.";
    }

    @Transactional
    public String confirmPasswordReset(ConfirmPasswordReset request) {
        User user = userRepository.findByActionTokenAndActiveTrue(request.token())
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Token không hợp lệ hoặc không tồn tại."));

        if (System.currentTimeMillis() > user.getActionTokenExpiry()) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Token đã hết hạn. Vui lòng yêu cầu lại.");
        }

        if (!user.isEmailVerified()) {
            throw new ApiException(AuthErrorCode.UNVERIFIED_EMAIL, "Email not verified. Please verify your email first.");
        }

        keycloakService.updatePassword(user.getKeycloakId(), request.newPassword());

        // Hủy token để chống Replay Attack
        user.setActionToken(null);
        user.setActionTokenExpiry(null);
        user.setTokenType(null);
        userRepository.save(user);

        keycloakService.logoutAllSessions(user.getKeycloakId());

        return "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.";
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

        char[] passwordArray = password.toString().toCharArray();
        for (int i = passwordArray.length - 1; i > 0; i--) {
            int j = random.nextInt(i + 1);
            char temp = passwordArray[i];
            passwordArray[i] = passwordArray[j];
            passwordArray[j] = temp;
        }

        return new String(passwordArray);
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