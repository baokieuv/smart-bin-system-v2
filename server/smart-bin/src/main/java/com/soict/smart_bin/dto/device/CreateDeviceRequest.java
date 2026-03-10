package com.soict.smart_bin.dto.device;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateDeviceRequest(
        @NotBlank(message = "Macaddress is required")
        String mac,

        @NotNull(message = "Longitude is required")
        Double longitude,

        @NotNull(message = "Latitude is required")
        Double latitude,

        String name
) {
}
