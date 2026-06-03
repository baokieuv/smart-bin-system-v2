package com.smart_bin.device_service.repository;

import com.smart_bin.device_service.entity.DeviceGroup;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DeviceGroupRepository extends JpaRepository<DeviceGroup, UUID> {
    Optional<DeviceGroup> findByIdAndActiveTrue(UUID id);
    Optional<DeviceGroup> findByIdAndTenantIdAndActiveTrue(UUID id, String tenantId);
    List<DeviceGroup> findAllByTenantIdAndActiveTrue(String id, Pageable pageable);
    Optional<DeviceGroup> findByCodeAndActiveTrue(String code);
    boolean existsByCodeAndActiveTrue(String code);
    Optional<DeviceGroup> findByTenantIdAndIsDefaultTrueAndActiveTrue(String tenantId);
}