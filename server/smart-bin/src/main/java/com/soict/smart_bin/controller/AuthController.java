package com.soict.smart_bin.controller;

import com.soict.smart_bin.common.ResponseFactory;
import com.soict.smart_bin.common.SuccessCode;
import com.soict.smart_bin.dto.auth.*;
import com.soict.smart_bin.dto.core.ApiResponseFormat;
import com.soict.smart_bin.service.AuthService;
import com.soict.smart_bin.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {
    private final ResponseFactory responseFactory;
    private final AuthService authService;
    private final UserService userService;

    @PostMapping("/login-password")
    public ResponseEntity<ApiResponseFormat<Object>> loginPassword(@Valid @RequestBody LoginRequest request) {
        var token = authService.loginPassword(request);
        return responseFactory.response(SuccessCode.OK, token);
    }

    @PostMapping("/login-google")
    public ResponseEntity<ApiResponseFormat<Object>> loginGoogle(@Valid @RequestBody LoginGoogleRequest request) {
        var keycloakToken = authService.loginGoogle(request.token());
        // Lưu ý: Nếu user.state là PENDING, Frontend sẽ nhận token này nhưng tự điều hướng ra trang "Set Password"
        return responseFactory.response(SuccessCode.OK, keycloakToken);
    }

    @PostMapping("/complete-profile")
    public ResponseEntity<ApiResponseFormat<Object>> completeProfile(
            @AuthenticationPrincipal Jwt jwt, // Lấy current userId từ token đang đăng nhập
            @RequestBody Map<String, String> body) {

        String newPassword = body.get("password");
        authService.completeProfile(jwt.getSubject(), newPassword);
        return responseFactory.response(SuccessCode.OK, "Profile completed successfully");
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponseFormat<Object>> refreshToken(@Valid @RequestBody RefreshTokenRequest request){
        var token = authService.refreshToken(request);
        return responseFactory.response(SuccessCode.OK, token);
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponseFormat<Object>> logout(@Valid @RequestBody LogoutRequest request) {
        authService.logout(request.refreshToken());
        return responseFactory.response(SuccessCode.OK, "Logged out successfully");
    }

    @PostMapping("/change-password")
    public ResponseEntity<ApiResponseFormat<Object>> changePassword(
            @Valid @RequestBody ChangePasswordRequest request
    ){
        return responseFactory.response(SuccessCode.OK, "");
    }

    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponseFormat<Object>> resetPassword(){
        return responseFactory.response(SuccessCode.OK, "");
    }

    @GetMapping("/verify-email")
    public ResponseEntity<ApiResponseFormat<Object>> verifyEmail(@RequestParam String token) {
        String message = userService.verifyEmail(token);
        return responseFactory.response(SuccessCode.OK, message);
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<ApiResponseFormat<Object>> resendVerification(@Valid @RequestBody ResendVerificationRequest request) {
        userService.resendVerificationEmail(request);
        return responseFactory.response(SuccessCode.OK, "Verification email sent successfully");
    }
}
