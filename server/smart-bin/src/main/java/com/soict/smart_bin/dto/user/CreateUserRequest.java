package com.soict.smart_bin.dto.user;

import com.soict.smart_bin.utils.CaptchaPayload;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateUserRequest (
        @NotBlank(message = "Email is required")
        @Email(message = "Email should be valid")
        String email,

        @NotBlank(message = "Password is required")
        @Size(min = 8, message = "Password must be at least 8 characters")
        String password,

        @NotBlank(message = "First name is required")
        String firstName,

        @NotBlank(message = "Last name is required")
        String lastName,

        @NotBlank(message = "Captcha is required")
        String captcha
) implements CaptchaPayload {
        @Override
        public String getCaptchaToken() {
                return captcha;
        }
}