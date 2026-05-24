package com.smart_bin.device_service.dto.response;

import com.smart_bin.device_service.entity.Device;

import java.util.Map;

public record DeviceConfigResponse (
    String accessToken,
    Map<String, Object> configs,
    String targetBinFirmwareVersion,
    String targetDesktopFirmwareVersion

){
    public static DeviceConfigResponse fromData(Map<String, Object> data, Device device) {
        return new DeviceConfigResponse(
                device.getAccessToken(),
                data,
                device.getTargetBinFirmware() != null ? device.getTargetBinFirmware().getVersion() : null,
                device.getTargetDesktopFirmware() != null ? device.getTargetDesktopFirmware().getVersion() : null
        );
    }
    // Hàm tiện ích để map từ Entity sang DTO
//    public static DeviceConfigResponse fromEntity(DeviceConfig config, Device device) {
//        DeviceGroup group = device.getDeviceGroup();
//
//        return new DeviceConfigResponse(
//                device.getAccessToken(),
//                config.getUserConfigs(),
//                group.getSharedSpecs(),
//                device.getTargetBinFirmware() != null ? device.getTargetBinFirmware().getVersion() : null,
//                device.getTargetDesktopFirmware() != null ? device.getTargetDesktopFirmware().getVersion() : null
//        );
//    }
}