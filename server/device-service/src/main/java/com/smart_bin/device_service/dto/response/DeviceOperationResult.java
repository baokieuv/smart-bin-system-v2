package com.smart_bin.device_service.dto.response;

public record DeviceOperationResult(
        String mac,
        boolean status,
        String message
) {}
