package com.smart_bin.media_service.dto.response;

import java.time.OffsetDateTime;

public record MediaFileDto(
        String objectName,
        long size,
        OffsetDateTime lastModified
) {
}
