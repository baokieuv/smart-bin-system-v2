package com.smart_bin.device_service.repository;

import com.smart_bin.device_service.common.DeviceState;
import com.smart_bin.device_service.common.DeviceStatus;
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

    @Query("SELECT d FROM Device d WHERE d.active = true " +
            "AND (:targetTenantId IS NULL OR d.tenantId = :targetTenantId) " +
            "AND (:targetUserId IS NULL OR d.userId = :targetUserId) " +
            "AND (:name IS NULL OR LOWER(d.name) LIKE LOWER(CONCAT('%', :name, '%'))) " + // Tối ưu: Search không phân biệt hoa thường
            "AND (:mac IS NULL OR d.mac = :mac) " +
            "AND (:status IS NULL OR d.status = :status) " +
            "AND (:groupId IS NULL OR d.deviceGroup.id = :groupId)") // Đã FIX: gọi vào d.deviceGroup.id
    Page<Device> searchDevices(
            @Param("targetTenantId") String targetTenantId,
            @Param("targetUserId") String targetUserId,
            @Param("name") String name,
            @Param("mac") String mac,
            @Param("status") DeviceStatus status,
            @Param("groupId") UUID groupId,
            Pageable pageable
    );
}