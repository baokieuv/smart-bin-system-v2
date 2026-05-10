package com.smart_bin.device_service.dto.response;

import com.smart_bin.device_service.entity.Device;
import com.smart_bin.device_service.entity.DeviceConfig;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class DeviceConfigResponse {
    private String accessToken;
    private Integer pollingInterval;
    private Double fullThreshold;
    private String targetBinFirmwareVersion;
    private String targetDesktopVersion;
    private Double deviceHeight;

    // Hàm tiện ích để map từ Entity sang DTO
    public static DeviceConfigResponse fromEntity(DeviceConfig config, Device device) {
        return DeviceConfigResponse.builder()
                .accessToken(device.getAccessToken())
                .pollingInterval(config.getPollingInterval())
                .fullThreshold(config.getFullThreshold())
                .targetBinFirmwareVersion(config.getTargetBinFirmware() != null ? config.getTargetBinFirmware().getVersion() : null)
                .targetDesktopVersion(config.getTargetDesktopFirmware() != null ? config.getTargetDesktopFirmware().getVersion() : null)
                .deviceHeight(device.getDeviceGroup().getBinHeight())
                .build();
    }
}