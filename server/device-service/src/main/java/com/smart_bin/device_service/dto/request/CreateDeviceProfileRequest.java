package com.smart_bin.device_service.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.Map;

public record CreateDeviceProfileRequest(
        @NotBlank
        String code,

        @NotBlank
        String name,

        @NotNull
        Map<String, Object> sharedSpecs
) {
}
