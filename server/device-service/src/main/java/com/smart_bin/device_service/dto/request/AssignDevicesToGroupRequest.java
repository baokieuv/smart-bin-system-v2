package com.smart_bin.device_service.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record AssignDevicesToGroupRequest(
        @NotBlank(message = "Group ID is required")
        String groupId,

        @NotNull(message = "MAC addresses list cannot be null")
        List<String> macAddresses
) {
}
