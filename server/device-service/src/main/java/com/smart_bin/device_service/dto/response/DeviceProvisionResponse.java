package com.smart_bin.device_service.dto.response;

public record DeviceProvisionResponse(
        String deviceId,    // ID nội bộ của hệ thống (UUID)
        String tbDeviceId,  // ID của thiết bị trên ThingsBoard
        String accessToken, // Token dùng để gửi MQTT/HTTP Telemetry lên ThingsBoard
        String message
) {}