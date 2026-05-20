package com.smart_bin.iam_service.repository;

import com.smart_bin.iam_service.entity.TenantUserControl;
import com.smart_bin.iam_service.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface TenantUserControlRepository extends JpaRepository<TenantUserControl, UUID> {
    Optional<TenantUserControl> findByTenantIdAndUserId(UUID tenantId, UUID userId);

    @Query("SELECT u FROM User u JOIN TenantUserControl tuc ON u.id = tuc.userId WHERE tuc.tenantId = :tenantId")
    Page<User> findUsersByTenantId(@Param("tenantId") UUID tenantId, Pageable pageable);

    boolean existsByTenantIdAndUserId(UUID tenantId, UUID userId);
}
