package com.smart_bin.iam_service.mapper;

import com.smart_bin.iam_service.dto.auth.request.CreateTenantRequest;
import com.smart_bin.iam_service.dto.user.response.TenantDto;
import com.smart_bin.iam_service.entity.Tenant;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingConstants;
import org.mapstruct.ReportingPolicy;

@Mapper(
        componentModel = MappingConstants.ComponentModel.SPRING,
        unmappedTargetPolicy = ReportingPolicy.IGNORE
)
public interface TenantMapper {

    @Mapping(target = "state", constant = "ACTIVE")
    Tenant toEntity(CreateTenantRequest request);

    TenantDto toDto(Tenant tenant);
}