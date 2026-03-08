package com.soict.smart_bin.entity;

import com.soict.smart_bin.common.TokenType;
import com.soict.smart_bin.common.UserState;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;
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

    @OneToMany(mappedBy = "user", cascade = {CascadeType.PERSIST, CascadeType.MERGE}, fetch = FetchType.LAZY)
    private List<Device> devices = new ArrayList<>();

    // --- Helper methods để quản lý quan hệ 2 chiều ---
    public void addDevice(Device device) {
        devices.add(device);
        device.setUser(this);
    }

    public void removeDevice(Device device) {
        devices.remove(device);
        device.setUser(null);
    }
}