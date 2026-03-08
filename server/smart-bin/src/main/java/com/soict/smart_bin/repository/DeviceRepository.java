package com.soict.smart_bin.repository;

import com.soict.smart_bin.entity.Device;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DeviceRepository extends JpaRepository<Device, String> {
    Optional<Device> findByIdAndActiveTrue(String id);
}
