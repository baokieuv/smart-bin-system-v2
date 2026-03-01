package com.soict.smart_bin.service;

import com.auth0.jwt.JWT;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.soict.smart_bin.common.Constants;
import com.soict.smart_bin.common.UserState;
import com.soict.smart_bin.dto.auth.LoginRequest;
import com.soict.smart_bin.dto.auth.RefreshTokenRequest;
import com.soict.smart_bin.dto.auth.TokenResponse;
import com.soict.smart_bin.entity.User;
import com.soict.smart_bin.exception.ApiException;
import com.soict.smart_bin.exception.CoreErrorCode;
import com.soict.smart_bin.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final KeycloakService keycloakService;
    private final UserRepository userRepository;
    private final EmailService emailService;

    private static final SecureRandom random = new SecureRandom();

    public TokenResponse loginPassword(LoginRequest request) {
        User user = userRepository.findByEmailAndActiveTrue(request.email())
                .orElseThrow(() -> new RuntimeException("User not found"));

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

        // 3. Kiểm tra user trong Database nội bộ
        Optional<User> existingUser = userRepository.findById(keycloakId);

        if (existingUser.isEmpty()) {
            // Lần đầu đăng nhập bằng Google -> Tạo mới user trong DB nội bộ
            User newUser = new User();
            newUser.setId(keycloakId);
            newUser.setEmail(email);
            newUser.setFirstName(firstName);
            newUser.setLastName(lastName);
            newUser.setEmailVerified(true); // Google đã verify
            newUser.setState(UserState.PENDING); // Đánh dấu PENDING chờ nhập Password
            userRepository.save(newUser);
        }

        return keycloakToken;
    }

    @Transactional
    public void completeProfile(String userId, String newPassword) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(CoreErrorCode.USER_NOT_FOUND));

        // Cập nhật mật khẩu lên Keycloak
        keycloakService.updatePassword(userId, newPassword);

        // Cập nhật trạng thái DB thành ACTIVE
        user.setState(UserState.ACTIVE);
        userRepository.save(user);
    }

    public TokenResponse refreshToken(RefreshTokenRequest request){
        return keycloakService.refreshAccessToken(request.refreshToken());
    }

    @Transactional
    public void changePassword(String userId, String oldPassword, String newPassword) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Verify old password by attempting login
        try {
            LoginRequest loginRequest = new LoginRequest(user.getEmail(), oldPassword);
            keycloakService.login(loginRequest);
        } catch (Exception e) {
            throw new RuntimeException("Current password is incorrect");
        }

        // Update password in Keycloak
        keycloakService.updatePassword(userId, newPassword);

        userRepository.save(user);
    }

    @Transactional
    public String resetPassword(String email){
        User user = userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found with email: " + email));

        if(!user.isEmailVerified()){
            throw new RuntimeException("Email not verified. Please verify your email first.");
        }

        String newPassword = generateRandomPassword();

        keycloakService.updatePassword(user.getId(), newPassword);

        emailService.sendPasswordResetEmail(
                user.getEmail(),
                user.getFirstName(),
                newPassword
        );

        userRepository.save(user);

        return "Password reset successful. Please check your email for the new password.";

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
