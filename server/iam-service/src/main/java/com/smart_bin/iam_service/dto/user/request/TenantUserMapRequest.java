package com.smart_bin.iam_service.dto.user.request;

import jakarta.validation.constraints.NotBlank;

public record TenantUserMapRequest(
        @NotBlank(message = "tenantId must not be blank")
        String tenantId,

        @NotBlank(message = "userId must not be blank")
        String userId
) {
}
