package com.smart_bin.iam_service.dto.auth.request;

import jakarta.validation.constraints.NotBlank;

public record UpdateTenantStatusRequest(
        @NotBlank(message = "Trạng thái không được để trống (ACTIVE/BLOCKED)")
        String status
) {}