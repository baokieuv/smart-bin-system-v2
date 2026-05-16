package com.smart_bin.iam_service.dto.auth.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record CreateTenantRequest(
        @NotBlank(message = "Tên Tenant không được để trống")
        String name,

        @Email(message = "Email không hợp lệ")
        @NotBlank(message = "Email không được để trống")
        String email
) {}