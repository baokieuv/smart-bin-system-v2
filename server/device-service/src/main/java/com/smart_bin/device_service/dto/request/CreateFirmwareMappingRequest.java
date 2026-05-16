package com.smart_bin.device_service.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record CreateFirmwareMappingRequest(
        @NotNull(message = "Tiêu chí Metadata không được để trống")
        Map<String, Object> metadataCriteria,

        @NotBlank(message = "ID Firmware đích không được để trống")
        String targetFirmwareId,

        Integer priority
) {}