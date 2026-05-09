package com.smart_bin.device_service.dto.response;

import java.util.UUID;

public record DeviceGroupResponse(
        UUID id,
        String code,
        String name,
        Double binHeight,
        String description
) {}