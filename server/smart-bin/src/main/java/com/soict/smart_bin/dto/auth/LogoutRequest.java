package com.soict.smart_bin.dto.auth;

import jakarta.validation.constraints.NotBlank;

public record LogoutRequest(
        @NotBlank(message = "Refresh token is required")
        String refreshToken
) {
}
