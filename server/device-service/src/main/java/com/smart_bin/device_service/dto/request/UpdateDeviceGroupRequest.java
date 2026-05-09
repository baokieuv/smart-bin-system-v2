package com.smart_bin.device_service.dto.request;

import jakarta.validation.constraints.Positive;

public record UpdateDeviceGroupRequest(
        String code,
        String name,
        @Positive(message = "Chiều cao phải lớn hơn 0")
        Double binHeight,
        String description
) {}