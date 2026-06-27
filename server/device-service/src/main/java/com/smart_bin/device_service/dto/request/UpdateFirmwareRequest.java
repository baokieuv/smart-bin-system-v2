package com.smart_bin.device_service.dto.request;

public record UpdateFirmwareRequest(
        String targetBinFirmwareId,
        String targetDesktopFirmwareId,
        String targetAiModelFirmwareId
) {
}
