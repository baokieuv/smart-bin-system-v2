package com.soict.smart_bin.dto.device;

import com.soict.smart_bin.common.DeviceState;
import com.soict.smart_bin.common.UserState;

import java.util.UUID;

public record DeviceDto (
        UUID id,
        String name,
        String accessToken,
        String mac,
        Double longitude,
        Double latitude,
        DeviceState state
) {
}
