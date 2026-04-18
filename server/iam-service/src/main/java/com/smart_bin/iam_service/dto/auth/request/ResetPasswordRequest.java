package com.smart_bin.iam_service.dto.auth.request;

import com.soict.smart_bin.utils.CaptchaPayload;
import jakarta.validation.constraints.NotBlank;

public record ResetPasswordRequest(
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
