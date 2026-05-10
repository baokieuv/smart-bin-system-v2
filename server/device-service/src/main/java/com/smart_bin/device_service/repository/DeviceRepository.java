package com.smart_bin.device_service.repository;

import com.smart_bin.device_service.entity.Device;
import io.lettuce.core.dynamic.annotation.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public interface DeviceRepository extends JpaRepository<Device, UUID> { // Đổi String thành UUID

    Optional<Device> findByIdAndActiveTrue(UUID id);

    Optional<Device> findByDeviceIdAndActiveTrue(String deviceId);

    Optional<Device> findByMacAndActiveTrue(String mac);

    Optional<Device> findByMac(String mac);

    Page<Device> findByKeycloakIdAndActiveTrue(String keycloakId, Pageable pageable);

    boolean existsByDeviceGroup_IdAndActiveTrue(UUID groupId);

    List<Device> findByMacIn(Set<String> macs);

    @Query(value = "SELECT d FROM Device d " +
            "LEFT JOIN FETCH d.deviceGroup " +
            "LEFT JOIN FETCH d.deviceConfig dc " +
            "LEFT JOIN FETCH dc.targetBinFirmware " +
            "LEFT JOIN FETCH dc.targetDesktopFirmware",
            countQuery = "SELECT count(d) FROM Device d")
    Page<Device> findAllForAdminWithConfig(Pageable pageable);

    @Query("SELECT d FROM Device d LEFT JOIN FETCH d.deviceGroup WHERE d.mac = :mac AND d.active = true")
    Optional<Device> findByMacAndActiveTrueWithGroup(@Param("mac") String mac);

    @Query("SELECT d FROM Device d LEFT JOIN FETCH d.deviceGroup WHERE d.mac = :mac")
    Optional<Device> findByMacWithGroup(@Param("mac") String mac);

    // BỎ: List<Device> findByUserAndActiveTrue(User user);
    // THÊM: Sử dụng khóa ngoại logic keycloakId (Lấy trực tiếp từ Token của Client)
//    List<Device> findByKeycloakIdAndActiveTrue(String keycloakId);
}