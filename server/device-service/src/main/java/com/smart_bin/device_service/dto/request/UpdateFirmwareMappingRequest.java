package com.smart_bin.device_service.dto.request;

import java.util.Map;

public record UpdateFirmwareMappingRequest(
        Map<String, Object> metadataCriteria,
        String targetFirmwareId,
        Integer priority
) {}