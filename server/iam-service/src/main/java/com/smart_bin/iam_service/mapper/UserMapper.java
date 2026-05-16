package com.smart_bin.iam_service.mapper;

import com.smart_bin.iam_service.dto.user.request.UpdateUserRequest;
import com.smart_bin.iam_service.dto.user.request.CreateUserRequest;
import com.smart_bin.iam_service.dto.user.response.UserDto;
import com.smart_bin.iam_service.entity.User;
import org.mapstruct.*;

@Mapper(
        componentModel = MappingConstants.ComponentModel.SPRING,
        unmappedTargetPolicy = ReportingPolicy.IGNORE
)
public interface UserMapper {
    UserDto toDto(User user);

    @Mapping(target = "emailVerified", constant = "false")
    @Mapping(target = "state", expression = "java(com.smart_bin.iam_service.common.UserState.PENDING)")
    User toEntity(CreateUserRequest request);

    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    void updateUserFromRequest(UpdateUserRequest request, @MappingTarget User user);
}