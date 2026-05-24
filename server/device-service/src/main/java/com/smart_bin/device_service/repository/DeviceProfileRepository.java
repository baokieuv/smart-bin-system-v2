package com.smart_bin.device_service.repository;

import com.smart_bin.device_service.entity.DeviceProfile;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DeviceProfileRepository extends JpaRepository<DeviceProfile, UUID> {
    Page<DeviceProfile> findAllByActiveTrue(Pageable pageable);
    Optional<DeviceProfile> findByIdAndActiveTrue(UUID id);
    Optional<DeviceProfile> findByCodeAndActiveTrue(String code);
    boolean existsByCodeAndActiveTrue(String code);
    boolean existsByCode(String code);
}