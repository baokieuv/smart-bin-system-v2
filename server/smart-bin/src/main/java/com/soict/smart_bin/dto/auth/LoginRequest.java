package com.soict.smart_bin.dto.auth;

import com.soict.smart_bin.utils.CaptchaPayload;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "Email is required")
        @Email(message = "Email should be valid")
        String username,

        @NotBlank(message = "Password is required")
        String password,

        @NotBlank(message = "Captcha is required")
        String captcha
) implements CaptchaPayload {

        @Override
        public String getCaptchaToken() {
                return captcha;
        }
}