package com.smart_bin.device_service.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record DeviceProvisionRequest(
        @NotBlank(message = "MAC Address không được để trống")
        String mac,

        @NotBlank(message = "Tenant Secret không được để trống")
        String tenantSecret,

        @NotBlank(message = "Group code should not be empty")
        String groupCode,

        @NotBlank(message = "Public Key của thiết bị không được để trống")
        String publicKey,

        @NotNull(message = "Hardware Metadata không được để trống")
        Map<String, Object> hwMetadata
) {}