package com.smart_bin.device_service.repository;

import com.smart_bin.device_service.entity.Device;
import com.smart_bin.device_service.entity.DeviceConfig;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DeviceConfigRepository extends JpaRepository<DeviceConfig, UUID> {
    Optional<DeviceConfig> findByDeviceId(UUID deviceId);
}
