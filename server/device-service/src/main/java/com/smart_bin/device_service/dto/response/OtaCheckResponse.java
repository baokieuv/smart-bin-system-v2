package com.smart_bin.device_service.dto.response;

public record OtaCheckResponse(
        boolean hasUpdate,
        String version,
        String downloadUrl,
        String signature
) {}