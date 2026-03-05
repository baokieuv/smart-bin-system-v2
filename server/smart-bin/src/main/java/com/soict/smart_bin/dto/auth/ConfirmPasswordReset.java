package com.soict.smart_bin.dto.auth;

import jakarta.validation.constraints.NotBlank;

public record ConfirmPasswordReset(
        @NotBlank(message = "Token is required")
        String token,

        @NotBlank(message = "New password is required")
        String newPassword
) {
}
