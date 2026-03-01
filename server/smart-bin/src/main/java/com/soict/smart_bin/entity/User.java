package com.soict.smart_bin.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "users")
@Getter
@Setter
public class User extends BaseEntity {
    @Id
    private String id; // Keycloak user ID

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    private String firstName;

    @Column(nullable = false)
    private String lastName;

    @Column(nullable = false)
    private boolean emailVerified = false;

    @Column
    private String verificationToken;

    @Column
    private Long verificationTokenExpiry;
}