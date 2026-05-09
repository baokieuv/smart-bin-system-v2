package com.smart_bin.iam_service.repository;


import com.smart_bin.core.common.UserRole;
import com.smart_bin.iam_service.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByKeycloakIdAndActiveTrue(String id);
    Optional<User> findByEmail(String email);
    Optional<User> findByEmailAndActiveTrue(String email);
    Optional<User> findByIdAndActiveTrue(UUID id);
    Optional<User> findByActionTokenAndActiveTrue(String token);
    Page<User> findByRoleOrKeycloakId(UserRole role, String keycloakId, Pageable pageable);
    boolean existsByEmail(String email);
}
