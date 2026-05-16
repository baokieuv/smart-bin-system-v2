package com.smart_bin.device_service.dto.response;

import java.util.Map;
import java.util.UUID;

public record FirmwareMappingResponse(
        UUID id,
        Map<String, Object> metadataCriteria,
        UUID targetFirmwareId,
        String targetFirmwareVersion, // Trả về version để frontend dễ hiển thị
        Integer priority,
        boolean active
) {}