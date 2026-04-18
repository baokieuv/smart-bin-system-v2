package com.smart_bin.media_service.dto.response;

public record UploadFileResponse(
        String objectName,
        String objectUrl,
        String contentType,
        long size
) {
}
