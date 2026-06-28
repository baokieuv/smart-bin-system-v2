package com.smart_bin.device_service.dto.response;

import com.smart_bin.device_service.common.FirmwareType;
import com.smart_bin.device_service.entity.Device;

import java.util.Map;

public record DeviceConfigResponse(
        String accessToken,
        Map<String, Object> configs,
        String targetBinFirmwareVersion,
        String targetDesktopFirmwareVersion,
        String targetAiModelVersion
) {
    public static DeviceConfigResponse fromData(Map<String, Object> data, Device device) {
        return new DeviceConfigResponse(
                device.getAccessToken(),
                data,
                extractTargetVersion(device, FirmwareType.ESP32),
                extractTargetVersion(device, FirmwareType.RASPBERRY_PI),
                extractTargetVersion(device, FirmwareType.AI_MODEL)
        );
    }

    private static String extractTargetVersion(Device device, FirmwareType type) {
        if (device.getFirmwareStates() == null) {
            return null;
        }

        return device.getFirmwareStates().stream()
                .filter(state -> state.getType() == type && state.getTargetFirmware() != null)
                .map(state -> state.getTargetFirmware().getVersion())
                .findFirst()
                .orElse(null);
    }
}