package com.smart_bin.device_service.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;

public record CreateDeviceGroupRequest(
        @NotBlank(message = "Mã nhóm không được để trống")
        String code,

        @NotBlank(message = "Tên nhóm không được để trống")
        String name,

        @NotNull(message = "Thuộc tính không được để trống")
        Map<String, Object> sharedSpecs,

        String description,

        List<AlarmRuleDto> alarmRules
) {}