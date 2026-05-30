package com.smart_bin.device_service.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record AssignDeviceToUserRequest(
        @NotNull(message = "MAC addresses must not be null")
        List<String> macAddresses,

        @NotBlank(message = "User ID must not be blank")
        String userId
) {
}
