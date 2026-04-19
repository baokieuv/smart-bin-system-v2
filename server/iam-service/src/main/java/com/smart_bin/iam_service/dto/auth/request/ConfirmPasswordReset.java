package com.smart_bin.iam_service.dto.auth.request;

import com.smart_bin.iam_service.utils.ValidPassword;
import jakarta.validation.constraints.NotBlank;

public record ConfirmPasswordReset(
        @NotBlank(message = "Token is required")
        String token,

        @NotBlank(message = "New password is required")
        @ValidPassword
        String newPassword
) {
}
