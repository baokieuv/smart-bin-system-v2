package com.soict.smart_bin.dto.auth;

import jakarta.validation.constraints.NotBlank;

public record LoginGoogleRequest(
        @NotBlank(message = "Token is required")
        String token
) {
}
