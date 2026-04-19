package com.smart_bin.iam_service.dto.user.request;

import jakarta.validation.constraints.NotBlank;

public record UpdateUserRequest(
        String firstName,

        String lastName,

        String avatarUrl
) {
}
