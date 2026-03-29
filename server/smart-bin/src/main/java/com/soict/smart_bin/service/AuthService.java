package com.soict.smart_bin.service;

import com.auth0.jwt.JWT;
import com.soict.smart_bin.common.Constants;
import com.soict.smart_bin.common.TokenType;
import com.soict.smart_bin.common.UserState;
import com.soict.smart_bin.dto.auth.*;
import com.soict.smart_bin.entity.User;
import com.soict.smart_bin.exception.ApiException;
import com.soict.smart_bin.exception.CoreErrorCode;
import com.soict.smart_bin.exception.UserErrorCode;
import com.soict.smart_bin.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final KeycloakService keycloakService;
    private final UserRepository userRepository;
    private final EmailService emailService;

    private static final SecureRandom random = new SecureRandom();

    public TokenResponse loginPassword(LoginRequest request) {
        User user = userRepository.findByEmailAndActiveTrue(request.username())
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        if (!user.isEmailVerified()) {
            throw new RuntimeException("Email not verified. Please check your email for verification link.");
        }

        return keycloakService.login(request);
    }

    public void logout(String refreshToken) {
        keycloakService.logout(refreshToken);
    }

    @Transactional
    public TokenResponse loginGoogle(String googleToken) {
        // 1. Đổi token Google lấy token Keycloak
        TokenResponse keycloakToken = keycloakService.exchangeGoogleToken(googleToken);

        // 2. Giải mã JWT của Keycloak để lấy thông tin user
        var jwt = JWT.decode(keycloakToken.accessToken());
        String keycloakId = jwt.getSubject();
        String email = jwt.getClaim("email").asString();
        String firstName = jwt.getClaim("given_name").asString();
        String lastName = jwt.getClaim("family_name").asString();
        String avatarUrl = jwt.getClaim("picture").asString();

        // 3. Kiểm tra user trong Database nội bộ
        Optional<User> existingUser = userRepository.findByKeycloakIdAndActiveTrue(keycloakId);

        if (existingUser.isEmpty()) {
            // Lần đầu đăng nhập bằng Google -> Tạo mới user trong DB nội bộ
            User newUser = new User();
            newUser.setKeycloakId(keycloakId);
            newUser.setEmail(email);
            newUser.setFirstName(firstName);
            newUser.setLastName(lastName);
            newUser.setAvatarUrl(avatarUrl);
            newUser.setEmailVerified(true); // Google đã verify
            newUser.setState(UserState.PENDING); // Đánh dấu PENDING chờ nhập Password
            userRepository.save(newUser);
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

        emailService.sendWelcomeEmail(user.getEmail(), user.getFirstName());
    }

    public TokenResponse refreshToken(RefreshTokenRequest request){
        return keycloakService.refreshAccessToken(request.refreshToken());
    }

    @Transactional
    public String changePassword(String keycloakId, ChangePasswordRequest request) {
        // 1. Lấy thông tin user
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        // 2. Validate đầu vào
        if (request.currentPassword().equals(request.newPassword())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Mật khẩu mới không được trùng với mật khẩu hiện tại.");
        }

        if (!request.newPassword().equals(request.confirmPassword())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Mật khẩu xác nhận không khớp.");
        }

        // 3. Xác thực mật khẩu cũ
        try {
            LoginRequest loginRequest = new LoginRequest(user.getEmail(), request.currentPassword(), null);
            keycloakService.login(loginRequest);
        } catch (Exception e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Mật khẩu hiện tại không chính xác.");
        }

        // 4. Cập nhật mật khẩu mới lên Keycloak
        keycloakService.updatePassword(keycloakId, request.newPassword());

        return "Change password successfully.";
    }

    public String requestPasswordReset(ResetPasswordRequest request){
        User user = userRepository.findByEmailAndActiveTrue(request.email()).orElse(null);

        if (user != null){
            String resetToken = UUID.randomUUID().toString();

            user.setActionToken(resetToken);
            user.setActionTokenExpiry(System.currentTimeMillis() + (15 * 60 * 1000));
            user.setTokenType(TokenType.RESET_PASSWORD);

            userRepository.save(user);

            emailService.sendPasswordResetEmail(
                    user.getEmail(),
                    user.getFirstName(),
                    resetToken
            );
        }

        return "Nếu email hợp lệ và đã được xác thực, một hướng dẫn đặt lại mật khẩu đã được gửi đến bạn.";
    }

    @Transactional
    public String confirmPasswordReset(ConfirmPasswordReset request){
        User user = userRepository.findByActionTokenAndActiveTrue(request.token())
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Token không hợp lệ hoặc không tồn tại."));

        // 2. Kiểm tra token hết hạn chưa
        if (System.currentTimeMillis() > user.getActionTokenExpiry()) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Token đã hết hạn. Vui lòng yêu cầu lại.");
        }

        if(!user.isEmailVerified()){
            throw new RuntimeException("Email not verified. Please verify your email first.");
        }

        // 3. Cập nhật mật khẩu mới lên Keycloak
        keycloakService.updatePassword(user.getKeycloakId(), request.newPassword());

        // 4. Hủy token để chống Replay Attack
        user.setActionToken(null);
        user.setActionTokenExpiry(null);
        user.setTokenType(null);
        userRepository.save(user);

        return "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.";
    }

    private String generateRandomPassword(){
        StringBuilder password = new StringBuilder(Constants.PASSWORD_LENGTH);

        // Đảm bảo có ít nhất 1 chữ hoa
        password.append("ABCDEFGHJKLMNPQRSTUVWXYZ".charAt(random.nextInt(25)));

        // Đảm bảo có ít nhất 1 chữ thường
        password.append("abcdefghijkmnpqrstuvwxyz".charAt(random.nextInt(25)));

        // Đảm bảo có ít nhất 1 số
        password.append("23456789".charAt(random.nextInt(8)));

        // Đảm bảo có ít nhất 1 ký tự đặc biệt
        password.append("!@#$%".charAt(random.nextInt(5)));

        // Fill phần còn lại
        for (int i = 4; i < Constants.PASSWORD_LENGTH; i++) {
            password.append(Constants.CHARACTERS.charAt(random.nextInt(Constants.CHARACTERS.length())));
        }

        // Shuffle các ký tự
        char[] passwordArray = password.toString().toCharArray();
        for (int i = passwordArray.length - 1; i > 0; i--) {
            int j = random.nextInt(i + 1);
            char temp = passwordArray[i];
            passwordArray[i] = passwordArray[j];
            passwordArray[j] = temp;
        }

        return new String(passwordArray);
    }

}
