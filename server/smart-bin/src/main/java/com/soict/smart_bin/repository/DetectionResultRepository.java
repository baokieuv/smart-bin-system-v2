package com.soict.smart_bin.repository;

import com.soict.smart_bin.entity.Device;
import com.soict.smart_bin.entity.DeviceDetectionResult;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DetectionResultRepository extends JpaRepository<DeviceDetectionResult, Long> {
}
