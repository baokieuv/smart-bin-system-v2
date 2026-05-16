package com.smart_bin.device_service.dto.response;


import com.smart_bin.device_service.common.DeviceState;
import com.smart_bin.device_service.common.DeviceStatus;

import java.time.Instant;
import java.util.UUID;

public record DeviceDto (
        UUID id,
        String name,
        String accessToken,
        String mac,
        Double longitude,
        Double latitude,
        DeviceState state,
        DeviceStatus status,
        Instant createdDate,
        Long claimedAt,
        String desktopVersion,
        String binVersion,
        String groupCode
) {
}
