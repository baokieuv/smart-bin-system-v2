package com.soict.smart_bin.repository;

import com.soict.smart_bin.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByEmail(String email);
    Optional<User> findByVerificationToken(String token);
    boolean existsByEmail(String email);
}
