package com.smart_bin.iam_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.iam_service.common.SuccessCode;
import com.smart_bin.iam_service.dto.auth.request.*;
import com.smart_bin.iam_service.serivce.AuthService;
import com.smart_bin.iam_service.serivce.UserService;
import com.smart_bin.iam_service.utils.RequireCaptcha;
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
    @RequireCaptcha(action = "LOGIN")
    public ResponseEntity<ApiResponseFormat<Object>> loginPassword(@Valid @RequestBody LoginRequest request) {
        var token = authService.loginPassword(request);
        return responseFactory.response(SuccessCode.OK, token);
    }

    @PostMapping("/login-google")
    public ResponseEntity<ApiResponseFormat<Object>> loginGoogle(@Valid @RequestBody LoginGoogleRequest request) {
        var keycloakToken = authService.loginGoogle(request.token());
        return responseFactory.response(SuccessCode.OK, keycloakToken);
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
            @Valid @RequestBody ChangePasswordRequest request,
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();

        var response = authService.changePassword(keycloakId, request);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/reset-password")
    @RequireCaptcha(action = "RESET_PASSWORD")
    public ResponseEntity<ApiResponseFormat<Object>> requestPasswordReset(@Valid @RequestBody ResetPasswordRequest request){

        var response = authService.requestPasswordReset(request);

        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/confirm-reset")
    public ResponseEntity<ApiResponseFormat<Object>> confirmPasswordReset(@Valid @RequestBody ConfirmPasswordReset request){
        var response = authService.confirmPasswordReset(request);

        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/verify-email")
    public ResponseEntity<ApiResponseFormat<Object>> verifyEmail(@RequestParam String token) {
        String message = userService.verifyEmail(token);

        return responseFactory.response(SuccessCode.OK, message);
    }

    @PostMapping("/resend-verification")
    @RequireCaptcha(action = "RESEND_VERIFICATION")
    public ResponseEntity<ApiResponseFormat<Object>> resendVerification(@Valid @RequestBody ResendVerificationRequest request) {

        userService.resendVerificationEmail(request);

        return responseFactory.response(SuccessCode.OK, "Verification email sent successfully");
    }

    @GetMapping("/verify-status")
    public ResponseEntity<ApiResponseFormat<Object>> verifyStatus(
            @AuthenticationPrincipal Jwt jwt
    ) {
        String keycloakId = jwt.getSubject();

        userService.verifyStatus(keycloakId);
        return responseFactory.response(SuccessCode.OK, "Tài khoản hợp lệ");
    }
}
