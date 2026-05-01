package com.smart_bin.iam_service.dto.auth.request;

import jakarta.validation.constraints.NotBlank;

public record UpdateUserAccessRequest(
        @NotBlank(message = "TargetUserId is required")
        String targetUserId,

        @NotBlank(message = "RoleName is required")
        String roleName
) {
}
