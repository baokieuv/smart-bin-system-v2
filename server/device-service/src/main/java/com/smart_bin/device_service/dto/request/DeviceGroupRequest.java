package com.smart_bin.device_service.dto.request;

public record DeviceGroupRequest(
        String code,
        String name,
        Double binHeight,
        String description
) {}