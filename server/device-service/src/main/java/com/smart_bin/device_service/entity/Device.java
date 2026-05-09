package com.smart_bin.device_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import com.smart_bin.device_service.common.DeviceState;
import com.smart_bin.device_service.common.DeviceStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "devices")
@Getter
@Setter
public class Device extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    private String accessToken;

    private String deviceId;

    @Column(nullable = false)
    private String mac;

    private String name;

    private Double longitude;

    private Double latitude;

    @Enumerated(EnumType.STRING)
    private DeviceState state;

    @Enumerated(EnumType.STRING)
    private DeviceStatus status;

    @Column(name = "keycloak_id", nullable = false, length = 36)
    private String keycloakId;

    @Column(columnDefinition = "TEXT")
    private String publicKey;

    @Column(name = "claimed_at")
    private Long claimedAt;

    @Column(name = "desktop_version")
    private String desktopVersion;

    @Column(name = "bin_version")
    private String binVersion;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "group_id")
    private DeviceGroup deviceGroup;

    @OneToOne(mappedBy = "device", fetch = FetchType.LAZY)
    private DeviceConfig deviceConfig;
}