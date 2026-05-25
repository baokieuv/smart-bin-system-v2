package com.smart_bin.iam_service.entity;

import com.smart_bin.core.common.UserRole;
import com.smart_bin.core.entity.BaseEntity;
import com.smart_bin.iam_service.common.UserState;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "tenants")
@Getter
@Setter
public class Tenant extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    @Column(nullable = false)
    private String keycloakId; // Keycloak user ID

    @Column(unique = true, nullable = false)
    private String email;

    private String name;

    @Enumerated(EnumType.STRING) // Store as a readable string (e.g., "ACTIVE")
    private UserState state;

    private String avatarUrl;

    private String provisionSecret;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role = UserRole.ADMIN;
}