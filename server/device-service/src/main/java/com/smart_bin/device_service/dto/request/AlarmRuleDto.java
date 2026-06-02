package com.smart_bin.device_service.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record AlarmRuleDto(
        @NotBlank(message = "Loại cảnh báo không được để trống (VD: HIGH_AVERAGE_WASTE)")
        String alarmType,

        @NotBlank(message = "Toán tử không được để trống (VD: GREATER, LESS_OR_EQUAL)")
        String operator,

        @NotNull(message = "Ngưỡng giá trị không được để trống")
        Double threshold,

        @NotBlank(message = "Mức độ nghiêm trọng không được để trống (VD: CRITICAL, MAJOR)")
        String severity,

        @NotBlank(message = "Toán tử so sánh để xóa cảnh báo không được để trống (VD: LESS, GREATER_OR_EQUAL)")
        String clearOperator,

        @NotNull(message = "Ngưỡng giá trị để xóa cảnh báo không được để trống")
        Double clearThreshold
) {}