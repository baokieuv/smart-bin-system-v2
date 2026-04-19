package com.smart_bin.iam_service.dto.user.response;

import com.smart_bin.iam_service.common.UserState;

import java.util.UUID;

public record UserDto(
        UUID id,
        String email,
        String firstName,
        String lastName,
        String avatarUrl,
        UserState state
) {
}
