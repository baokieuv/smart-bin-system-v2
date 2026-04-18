package com.smart_bin.device_service.repository;

import com.smart_bin.device_service.entity.DeviceDetectionResult;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DetectionResultRepository extends JpaRepository<DeviceDetectionResult, Long> {
}
