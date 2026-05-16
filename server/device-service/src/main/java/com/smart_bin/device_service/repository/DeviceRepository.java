package com.smart_bin.device_service.repository;

import com.smart_bin.device_service.entity.Device;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import javax.swing.text.html.Option;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DeviceRepository extends JpaRepository<Device, UUID> {
    Optional<Device> findByMac(String mac);

    Optional<Device> findByMacAndActiveTrue(String mac);

    Optional<Device> findByDeviceIdAndActiveTrue(String deviceId);

    List<Device> findByMacIn(Collection<String> macs);

    // Map với cột userId trong entity
    Page<Device> findByUserIdAndActiveTrue(String userId, Pageable pageable);

    Optional<Device> findByIdAndActiveTrue(UUID id);

    boolean existsByDeviceGroup_IdAndActiveTrue(UUID groupId);

    @Query("SELECT d FROM Device d LEFT JOIN FETCH d.deviceConfig")
    Page<Device> findAllForAdminWithConfig(Pageable pageable);

    @Query("SELECT d FROM Device d LEFT JOIN FETCH d.deviceConfig WHERE d.tenantId = :tenantId")
    Page<Device> findAllByTenantIdForAdminWithConfig(@Param("tenantId") String tenantId, Pageable pageable);

    @Query("SELECT d FROM Device d LEFT JOIN FETCH d.deviceGroup WHERE d.mac = :mac")
    Optional<Device> findByMacWithGroup(@Param("mac") String mac);
}