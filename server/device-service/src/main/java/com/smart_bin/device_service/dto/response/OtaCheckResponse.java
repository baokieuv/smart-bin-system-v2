package com.smart_bin.device_service.dto.response;

public record OtaCheckResponse(
        FirmwareUpdateInfo esp32,
        FirmwareUpdateInfo raspberryPi,
        FirmwareUpdateInfo aiModel
) {
    public record FirmwareUpdateInfo(
            boolean hasUpdate,
            String version,
            String downloadUrl,
            String signature
    ) {}
}