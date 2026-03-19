package com.soict.smart_bin.dto.device;

public record DeviceActivityWebhookRequest(
        String deviceId,

        Boolean active,

        Long timestamp
) {
}
