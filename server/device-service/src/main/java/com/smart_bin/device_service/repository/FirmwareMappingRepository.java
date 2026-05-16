package com.smart_bin.device_service.repository;

import com.smart_bin.device_service.entity.FirmwareMapping;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FirmwareMappingRepository extends JpaRepository<FirmwareMapping, UUID> {

    // Dùng cho Job/Logic tự động cấp phát firmware
    List<FirmwareMapping> findAllByActiveTrueOrderByPriorityDesc();

    // Dùng cho Admin lấy danh sách có phân trang
    Page<FirmwareMapping> findAllByActiveTrueOrderByPriorityDesc(Pageable pageable);

    // Dùng cho Update/Detail
    Optional<FirmwareMapping> findByIdAndActiveTrue(UUID id);
}