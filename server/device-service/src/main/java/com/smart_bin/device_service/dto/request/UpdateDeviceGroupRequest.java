package com.smart_bin.device_service.dto.request;

import java.util.Map;

public record UpdateDeviceGroupRequest(
        String code,
        String name,
        Map<String, Object> metadata,
        String description
) {}