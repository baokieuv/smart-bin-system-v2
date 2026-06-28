package com.smart_bin.device_service.dto.response;

public record FirmwareResponse(
        String currentVersion,

        String targetVersion
) {
}
