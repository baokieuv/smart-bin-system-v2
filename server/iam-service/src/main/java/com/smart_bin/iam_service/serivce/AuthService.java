package com.smart_bin.iam_service.serivce;

import com.auth0.jwt.JWT;
import com.smart_bin.core.common.EmailType;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.iam_service.common.TokenType;
import com.smart_bin.iam_service.common.UserState;
import com.smart_bin.iam_service.dto.auth.request.*;
import com.smart_bin.iam_service.dto.auth.response.TokenResponse;
import com.smart_bin.iam_service.entity.Tenant;
import com.smart_bin.iam_service.entity.User;
import com.smart_bin.iam_service.exception.AuthErrorCode;
import com.smart_bin.iam_service.exception.UserErrorCode;
import com.smart_bin.iam_service.repository.TenantRepository;
import com.smart_bin.iam_service.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {
    private final KeycloakService keycloakService;
    private final UserRepository userRepository;
    private final TenantRepository tenantRepository;
    private final UserService userService;

    public TokenResponse loginPassword(LoginRequest request) {
        Optional<Tenant> tenantOpt = tenantRepository.findByEmail(request.username()).filter(Tenant::isActive);
        if (tenantOpt.isPresent()) {
            if (tenantOpt.get().getState() != UserState.ACTIVE) {
                throw new ApiException(AuthErrorCode.PARTNER_ACCOUNT_BLOCKED);
            }
            return keycloakService.login(request);
        }

        Optional<User> userOpt = userRepository.findByEmail(request.username()).filter(User::isActive);
        if (userOpt.isPresent()) {
            if (!userOpt.get().isEmailVerified()) {
                throw new ApiException(AuthErrorCode.UNVERIFIED_EMAIL, "Email chưa được xác thực.");
            }
            return keycloakService.login(request);
        }

        throw new ApiException(AuthErrorCode.WRONG_CREDENTIALS);
    }

    public void logout(String refreshToken) {
        keycloakService.logout(refreshToken);
    }

    @Transactional
    public TokenResponse loginGoogle(String googleToken) {
        TokenResponse keycloakToken = keycloakService.exchangeGoogleToken(googleToken);

        var jwt = JWT.decode(keycloakToken.accessToken());
        String keycloakId = jwt.getSubject();
        String jwtEmail = jwt.getClaim("email").asString();
        String firstName = jwt.getClaim("given_name").asString();
        String lastName = jwt.getClaim("family_name").asString();
        String avatarUrl = jwt.getClaim("picture").asString();

        String fullName = (firstName != null ? firstName : "") + " " + (lastName != null ? lastName : "");

        // Uỷ quyền cho UserService lo việc lưu trữ và khởi tạo DB
        userService.syncGoogleUser(keycloakId, jwtEmail, fullName.trim(), avatarUrl);

        return keycloakToken;
    }


    public TokenResponse refreshToken(RefreshTokenRequest request) {
        return keycloakService.refreshAccessToken(request.refreshToken());
    }

    @Transactional
    public String changePassword(String keycloakId, ChangePasswordRequest request) {
        if (request.currentPassword().equals(request.newPassword())) {
            throw new ApiException(AuthErrorCode.PASSWORD_MUST_BE_DIFFERENT);
        }

        if (!request.newPassword().equals(request.confirmPassword())) {
            throw new ApiException(AuthErrorCode.PASSWORD_MISMATCH);
        }

        String email;
        Optional<Tenant> tenantOpt = tenantRepository.findByKeycloakId(keycloakId).filter(Tenant::isActive);
        if (tenantOpt.isPresent()) {
            email = tenantOpt.get().getEmail();
        } else {
            User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                    .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));
            email = user.getEmail();
        }

        try {
            LoginRequest loginRequest = new LoginRequest(email, request.currentPassword(), null);
            keycloakService.login(loginRequest);
        } catch (Exception e) {
            throw new ApiException(AuthErrorCode.CURRENT_PASSWORD_INCORRECT);
        }

        keycloakService.updatePassword(keycloakId, request.newPassword());
        keycloakService.logoutAllSessions(keycloakId);

        return "Change password successfully.";
    }

    @Transactional
    public String requestPasswordReset(ResetPasswordRequest request) {
        Optional<Tenant> tenantOpt = tenantRepository.findByEmail(request.email()).filter(Tenant::isActive);
        if (tenantOpt.isPresent()) {
            throw new ApiException(AuthErrorCode.TENANT_RESET_PASSWORD_NOT_SUPPORTED);
        }

        User user = userRepository.findByEmailAndActiveTrue(request.email()).orElse(null);
        if (user != null) {
            String resetToken = UUID.randomUUID().toString();
            user.setActionToken(resetToken);
            user.setActionTokenExpiry(System.currentTimeMillis() + (15 * 60 * 1000));
            user.setTokenType(TokenType.RESET_PASSWORD);
            userRepository.save(user);

            userService.sendEmailToUser(user.getEmail(), user.getName(), resetToken, EmailType.RESET_PASSWORD);
        }

        return "Hướng dẫn đặt lại mật khẩu đã được gửi đến bạn.";
    }

    @Transactional
    public String confirmPasswordReset(ConfirmPasswordReset request) {
        User user = userRepository.findByActionTokenAndActiveTrue(request.token())
                .orElseThrow(() -> new ApiException(AuthErrorCode.INVALID_TOKEN));

        if (System.currentTimeMillis() > user.getActionTokenExpiry()) {
            throw new ApiException(AuthErrorCode.TOKEN_EXPIRED);
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
}