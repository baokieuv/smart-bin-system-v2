package com.smart_bin.iam_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import com.smart_bin.iam_service.common.TokenType;
import com.smart_bin.iam_service.common.UserState;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;


@Entity
@Table(name = "users")
@Getter
@Setter
public class User extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    @Column(nullable = false)
    private String keycloakId; // Keycloak user ID

    @Column(unique = true, nullable = false)
    private String email;

    private String firstName;

    private String lastName;

    @Column(nullable = false)
    private boolean emailVerified = false;

    private String actionToken;

    private Long actionTokenExpiry;

    @Enumerated(EnumType.STRING)
    private TokenType tokenType;

    @Enumerated(EnumType.STRING) // Store as a readable string (e.g., "ACTIVE")
    private UserState state;

    private String avatarUrl;
}