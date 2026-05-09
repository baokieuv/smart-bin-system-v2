package com.smart_bin.device_service.mapper;

import com.smart_bin.device_service.dto.request.CreateDeviceGroupRequest;
import com.smart_bin.device_service.dto.request.UpdateDeviceGroupRequest;
import com.smart_bin.device_service.dto.response.DeviceGroupResponse;
import com.smart_bin.device_service.entity.DeviceGroup;
import org.mapstruct.BeanMapping;
import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.ReportingPolicy;

@Mapper(
        componentModel = MappingConstants.ComponentModel.SPRING,
        unmappedTargetPolicy = ReportingPolicy.IGNORE
)
public interface DeviceGroupMapper {

    DeviceGroup toEntity(CreateDeviceGroupRequest request);

    DeviceGroupResponse toResponse(DeviceGroup entity);

    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    void updateDeviceGroupFromRequest(UpdateDeviceGroupRequest request, @MappingTarget DeviceGroup entity);
}