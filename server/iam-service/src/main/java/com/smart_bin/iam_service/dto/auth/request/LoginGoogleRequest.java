package com.smart_bin.iam_service.dto.auth.request;

import jakarta.validation.constraints.NotBlank;

public record LoginGoogleRequest(
        @NotBlank(message = "Token is required")
        String token
) {
}
