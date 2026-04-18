package com.smart_bin.iam_service.repository;


import com.smart_bin.iam_service.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByKeycloakIdAndActiveTrue(String id);
    Optional<User> findByEmail(String email);
    Optional<User> findByEmailAndActiveTrue(String email);
    Optional<User> findByIdAndActiveTrue(UUID id);
    Optional<User> findByActionTokenAndActiveTrue(String token);
    boolean existsByEmail(String email);
}
