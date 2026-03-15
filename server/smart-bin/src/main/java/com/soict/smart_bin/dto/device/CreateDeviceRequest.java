package com.soict.smart_bin.dto.device;

import jakarta.validation.constraints.*;

public record CreateDeviceRequest(
        @Pattern(regexp = "^([0-9A-Fa-f]{2}[:-]?){5}([0-9A-Fa-f]{2})$", message = "Invalid MAC address format")
        String mac,

        @NotNull(message = "Longitude is required")
        @Min(value = -180, message = "Longitude must be greater than or equal to -180")
        @Max(value = 180, message = "Longitude must be less than or equal to 180")
        Double longitude,

        @NotNull(message = "Latitude is required")
        @Min(value = -90, message = "Latitude must be greater than or equal to -90")
        @Max(value = 90, message = "Latitude must be less than or equal to 90")
        Double latitude,

        String name
) {
}
