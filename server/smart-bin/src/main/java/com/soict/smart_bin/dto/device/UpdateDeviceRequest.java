package com.soict.smart_bin.dto.device;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.util.Map;

public record UpdateDeviceRequest(
        String name,

        @Min(value = -90, message = "Latitude must be greater than or equal to -90")
        @Max(value = 90, message = "Latitude must be less than or equal to 90")
        Double latitude,

        @Min(value = -180, message = "Longitude must be greater than or equal to -180")
        @Max(value = 180, message = "Longitude must be less than or equal to 180")
        Double longitude,

        String scope,
        Map<String, Object> additionalAttributes
) {}