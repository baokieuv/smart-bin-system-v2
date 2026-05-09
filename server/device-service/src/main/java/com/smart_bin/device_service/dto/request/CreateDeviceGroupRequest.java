package com.smart_bin.device_service.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record CreateDeviceGroupRequest(
        @NotBlank(message = "Mã nhóm không được để trống")
        String code,

        @NotBlank(message = "Tên nhóm không được để trống")
        String name,

        @NotNull(message = "Chiều cao không được để trống")
        @Positive(message = "Chiều cao phải lớn hơn 0")
        Double binHeight,

        String description
) {}