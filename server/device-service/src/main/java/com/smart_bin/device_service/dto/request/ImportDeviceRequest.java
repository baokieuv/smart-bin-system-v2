package com.smart_bin.device_service.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record ImportDeviceRequest(
        @NotEmpty(message = "Danh sách thiết bị không được để trống")
        List<@Valid DeviceImportItem> devices
) {}
