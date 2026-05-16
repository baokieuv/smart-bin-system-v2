package com.smart_bin.device_service.dto.response;

import java.util.Map;
import java.util.UUID;

public record DeviceGroupResponse(
        UUID id,
        String code,
        String name,
        Map<String, Object> sharedSpecs,
        String description
) {}