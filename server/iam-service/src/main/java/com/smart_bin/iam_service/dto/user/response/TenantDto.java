package com.smart_bin.iam_service.dto.user.response;

import java.util.UUID;

public record TenantDto(
        UUID id,
        String keycloakId,
        String name,
        String email,
        String state,
        String avatarUrl
) {}