package com.smart_bin.device_service.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.util.Map;

public record DeviceImportItem(
        @NotBlank(message = "Địa chỉ MAC không được để trống")
        @Pattern(regexp = "^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$", message = "Địa chỉ MAC không đúng định dạng (VD: AA:BB:CC:DD:EE:FF)")
        String mac,

        String name,

        @NotNull(message = "Claim code is required")
        String claimCode,

        Double latitude,
        Double longitude,
        Map<String, Object> description
) {}