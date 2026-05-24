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
    List<DeviceGroup> findByCodeIn(Collection<String> codes);
    Optional<DeviceGroup> findByIdAndActiveTrue(UUID id);
    Optional<DeviceGroup> findByIdAndTenantIdAndActiveTrue(UUID id, String tenantId);
    Optional<DeviceGroup> findByCodeAndActiveTrue(String code);
    Page<DeviceGroup> findAllByActiveTrue(Pageable pageable);
    List<DeviceGroup> findAllByTenantIdAndActiveTrue(String id, Pageable pageable);
    boolean existsByCodeAndActiveTrue(String code);
    boolean existsByCodeAndIdNotAndActiveTrue(String code, UUID id);
}