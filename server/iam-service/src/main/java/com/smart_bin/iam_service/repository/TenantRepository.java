package com.smart_bin.iam_service.repository;

import com.smart_bin.iam_service.entity.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface TenantRepository extends JpaRepository<Tenant, UUID> {
    Optional<Tenant> findByEmail(String email);
    Optional<Tenant> findByKeycloakId(String keycloakId);
}
