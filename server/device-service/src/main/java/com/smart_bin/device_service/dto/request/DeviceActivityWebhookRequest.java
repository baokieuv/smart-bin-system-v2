package com.smart_bin.device_service.dto.request;

public record DeviceActivityWebhookRequest(
        String deviceId,

        Boolean active,

        Long timestamp
) {
}
