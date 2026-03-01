package com.soict.smart_bin.mapper;

import com.soict.smart_bin.dto.user.UserDto;
import com.soict.smart_bin.entity.User;
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