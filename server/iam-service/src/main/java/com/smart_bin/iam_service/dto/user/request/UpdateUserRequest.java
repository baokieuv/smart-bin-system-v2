package com.smart_bin.iam_service.dto.user.request;

import jakarta.validation.constraints.NotBlank;

public record UpdateUserRequest(
        @NotBlank(message = "First name is required")
        String firstName,

        String lastName
) {
}
