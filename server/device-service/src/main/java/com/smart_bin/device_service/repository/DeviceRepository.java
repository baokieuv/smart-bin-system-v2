package com.smart_bin.device_service.repository;

import com.smart_bin.device_service.entity.Device;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DeviceRepository extends JpaRepository<Device, UUID> { // Đổi String thành UUID

    Optional<Device> findByIdAndActiveTrue(UUID id);

    Optional<Device> findByDeviceIdAndActiveTrue(String deviceId);

    Optional<Device> findByMacAndActiveTrue(String mac);

    Optional<Device> findByMac(String mac);

    // BỎ: List<Device> findByUserAndActiveTrue(User user);
    // THÊM: Sử dụng khóa ngoại logic keycloakId (Lấy trực tiếp từ Token của Client)
    List<Device> findByKeycloakIdAndActiveTrue(String keycloakId);
}