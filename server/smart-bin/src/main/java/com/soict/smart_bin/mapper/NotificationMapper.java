package com.soict.smart_bin.mapper;

import com.soict.smart_bin.dto.device.DeviceDto;
import com.soict.smart_bin.dto.notification.NotificationDto;
import com.soict.smart_bin.entity.Device;
import com.soict.smart_bin.entity.Notification;
import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;
import org.mapstruct.ReportingPolicy;

@Mapper(
        componentModel = MappingConstants.ComponentModel.SPRING,
        unmappedTargetPolicy = ReportingPolicy.IGNORE // Good practice for DTOs
)
public interface NotificationMapper {
    NotificationDto toDto(Notification notification);
}