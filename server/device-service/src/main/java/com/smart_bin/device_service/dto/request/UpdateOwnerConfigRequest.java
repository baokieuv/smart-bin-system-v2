package com.smart_bin.device_service.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record UpdateOwnerConfigRequest(
        @Min(value = 300, message = "Thời gian polling tối thiểu là 5 phút (300s)")
        @Max(value = 86400, message = "Thời gian polling tối đa là 24h (86400s)")
        Integer pollingInterval,

        Double fullThreshold
) {}