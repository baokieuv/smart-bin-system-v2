package com.smart_bin.device_service.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "Email is required")
        @Email(message = "Email should be valid")
        String username,

        @NotBlank(message = "Password is required")
        String password
) {}