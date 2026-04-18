package com.smart_bin.noti_service.mapper;

import com.smart_bin.noti_service.dto.response.NotificationDto;
import com.smart_bin.noti_service.entity.Notification;
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