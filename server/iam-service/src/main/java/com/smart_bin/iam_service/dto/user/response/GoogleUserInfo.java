package com.smart_bin.iam_service.dto.user.response;

public record GoogleUserInfo(
        String googleId,
        String email,
        String fullName,
        String avatarUrl
) {}
