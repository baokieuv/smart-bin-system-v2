package com.smart_bin.device_service.mapper;

import com.smart_bin.device_service.dto.response.FirmwareMappingResponse;
import com.smart_bin.device_service.entity.FirmwareMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingConstants;

@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)
public interface FirmwareMappingMapper {

    @Mapping(source = "targetFirmware.id", target = "targetFirmwareId")
    @Mapping(source = "targetFirmware.version", target = "targetFirmwareVersion")
    FirmwareMappingResponse toResponse(FirmwareMapping mapping);
}