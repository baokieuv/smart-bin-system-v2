package com.smart_bin.device_service.repository;

import com.smart_bin.device_service.entity.DeviceGroup;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public interface DeviceGroupRepository extends JpaRepository<DeviceGroup, UUID> {
    Page<DeviceGroup> findAllByActiveTrue(Pageable pageable);

    Optional<DeviceGroup> findByIdAndActiveTrue(UUID id);

    boolean existsByCodeAndActiveTrue(String code);

    boolean existsByCodeAndIdNotAndActiveTrue(String code, UUID id);

    List<DeviceGroup> findByCodeIn(Set<String> codes);
}