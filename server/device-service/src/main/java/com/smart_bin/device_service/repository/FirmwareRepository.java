package com.smart_bin.device_service.repository;

import com.smart_bin.device_service.entity.Firmware;
import com.smart_bin.device_service.common.FirmwareType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface FirmwareRepository extends JpaRepository<Firmware, UUID> {
    Optional<Firmware> findByVersion(String version);

    Optional<Firmware> findByVersionAndType(String version, FirmwareType type);

    Page<Firmware> findAllByActiveTrue(Pageable page);
}
