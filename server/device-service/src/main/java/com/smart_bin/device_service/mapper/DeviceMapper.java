package com.smart_bin.device_service.mapper;

import com.smart_bin.device_service.dto.response.DeviceDto;
import com.smart_bin.device_service.entity.Device;
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
    @Mapping(source = "deviceConfig.targetBinFirmware.version", target = "targetBinVersion")
    @Mapping(source = "deviceConfig.targetDesktopFirmware.version", target = "targetDesktopVersion")
    DeviceDto toDto(Device device);
}
