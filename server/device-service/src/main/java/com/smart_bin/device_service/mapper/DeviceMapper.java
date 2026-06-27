package com.smart_bin.device_service.mapper;

import com.smart_bin.device_service.common.FirmwareType;
import com.smart_bin.device_service.dto.response.DeviceDto;
import com.smart_bin.device_service.dto.response.FirmwareResponse;
import com.smart_bin.device_service.entity.Device;
import com.smart_bin.device_service.entity.DeviceFirmwareState;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingConstants;
import org.mapstruct.ReportingPolicy;

@Mapper(
        componentModel = MappingConstants.ComponentModel.SPRING,
        unmappedTargetPolicy = ReportingPolicy.IGNORE // Good practice for DTOs
)
public interface DeviceMapper {
    @Mapping(source = "deviceGroup.code", target = "groupCode")
    @Mapping(target = "desktopFirmware", expression = "java(extractVersion(device, com.smart_bin.device_service.common.FirmwareType.RASPBERRY_PI))")
    @Mapping(target = "binFirmware", expression = "java(extractVersion(device, com.smart_bin.device_service.common.FirmwareType.ESP32))")
    @Mapping(target = "aiModelFirmware", expression = "java(extractVersion(device, com.smart_bin.device_service.common.FirmwareType.AI_MODEL))")
    DeviceDto toDto(Device device);

    default FirmwareResponse extractVersion(Device device, FirmwareType type) {
        if (device.getFirmwareStates() == null) {
            return null;
        }
        return device.getFirmwareStates().stream()
                .filter(state -> state.getType() == type)
                .map(it -> new FirmwareResponse(it.getCurrentVersion(), it.getTargetFirmware().getVersion()))
                .findFirst()
                .orElse(null);
    }
}
