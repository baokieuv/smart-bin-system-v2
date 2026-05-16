package com.smart_bin.iam_service.dto.auth.response;

import java.util.UUID;

public record TenantDto(
        UUID id,
        String name,
        String email,
        String state
) {}