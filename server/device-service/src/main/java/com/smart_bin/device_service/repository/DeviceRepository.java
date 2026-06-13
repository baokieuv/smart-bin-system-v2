package com.smart_bin.device_service.repository;

import com.smart_bin.device_service.entity.Device;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    @Query("SELECT d FROM Device d WHERE d.active = true AND (d.userId = :id OR d.tenantId = :id)")
    Page<Device> findActiveDevicesByUserOrTenant(@Param("id") String id, Pageable pageable);

    Optional<Device> findByIdAndActiveTrue(UUID id);

    boolean existsByDeviceGroup_IdAndActiveTrue(UUID groupId);

    @Query(value = "SELECT d FROM Device d LEFT JOIN FETCH d.deviceGroup",
            countQuery = "SELECT COUNT(d) FROM Device d")
    Page<Device> findAllForAdminWithConfig(Pageable pageable);

    @Query(value = "SELECT d FROM Device d LEFT JOIN FETCH d.deviceGroup WHERE d.tenantId = :tenantId",
            countQuery = "SELECT COUNT(d) FROM Device d WHERE d.tenantId = :tenantId")
    Page<Device> findAllByTenantIdForAdminWithConfig(@Param("tenantId") String tenantId, Pageable pageable);

    @Query("SELECT d FROM Device d LEFT JOIN FETCH d.deviceGroup WHERE d.mac = :mac")
    Optional<Device> findByMacWithGroup(@Param("mac") String mac);

    List<Device> findByMacInAndActiveTrue(List<String> macs);

    Page<Device> findByTenantIdAndActiveTrue(String tenantId, Pageable pageable);

    long countByUserIdAndTenantId(String userId, String tenantId);
}