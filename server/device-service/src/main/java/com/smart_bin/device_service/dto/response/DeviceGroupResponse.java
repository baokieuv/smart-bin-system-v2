package com.smart_bin.device_service.dto.response;

import com.smart_bin.device_service.dto.request.AlarmRuleDto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public record DeviceGroupResponse(
        UUID id,
        String code,
        String name,
        Map<String, Object> sharedSpecs,
        String description,
        List<AlarmRuleDto> alarmRules
) {}