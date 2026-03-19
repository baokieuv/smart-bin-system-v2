package com.soict.smart_bin.repository;

import com.soict.smart_bin.entity.Device;
import com.soict.smart_bin.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DeviceRepository extends JpaRepository<Device, String> {
    Optional<Device> findByIdAndActiveTrue(UUID id);
    Optional<Device> findByDeviceIdAndActiveTrue(String deviceId);
    Optional<Device> findByMacAndActiveTrue(String mac);
    List<Device> findByUserAndActiveTrue(User user);
    Optional<Device> findByMac(String mac);
}
