package com.soict.smart_bin.entity;

import com.soict.smart_bin.common.TokenType;
import com.soict.smart_bin.common.UserState;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;


@Entity
@Table(name = "users")
@Getter
@Setter
public class User extends BaseEntity {
    @Id
    private String id; // Keycloak user ID

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
}