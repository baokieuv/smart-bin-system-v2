package com.smart_bin.iam_service.dto.auth.request;

import com.smart_bin.iam_service.utils.CaptchaPayload;
import jakarta.validation.constraints.NotBlank;

public record ResendVerificationRequest(
        @NotBlank(message = "Email is required")
        String email,

        @NotBlank(message = "Captcha is required")
        String captcha
) implements CaptchaPayload {
        @Override
        public String getCaptchaToken() {
                return captcha;
        }
}
