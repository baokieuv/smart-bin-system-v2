package com.smart_bin.device_service.dto.request;

import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;

public record UpdateDeviceGroupRequest(
        String code,
        String name,
        Map<String, Object> sharedSpecs,
        String description,
        List<AlarmRuleDto> alarmRules
) {}