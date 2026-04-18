package com.smart_bin.media_service.dto.response;

public record PresignedUrlResponse(
        String objectName,
        String url,
        int expiresInSeconds
) {
}
