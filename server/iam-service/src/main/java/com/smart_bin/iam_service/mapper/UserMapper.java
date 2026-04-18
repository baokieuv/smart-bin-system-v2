package com.smart_bin.iam_service.mapper;

import com.smart_bin.iam_service.dto.user.response.UserDto;
import com.smart_bin.iam_service.entity.User;
import org.mapstruct.Mapper;
import org.mapstruct.MappingConstants;
import org.mapstruct.ReportingPolicy;

@Mapper(
        componentModel = MappingConstants.ComponentModel.SPRING,
        unmappedTargetPolicy = ReportingPolicy.IGNORE // Good practice for DTOs
)
public interface UserMapper {
    UserDto toDto(User user);
}