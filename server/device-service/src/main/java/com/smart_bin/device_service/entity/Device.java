package com.smart_bin.device_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import com.smart_bin.device_service.common.DeviceState;
import com.smart_bin.device_service.common.DeviceStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "devices")
@Getter
@Setter
public class Device extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    // --- Thingsboard / Định danh ---
    private String accessToken;
    private String deviceId;

    @Column(nullable = false, unique = true)
    private String mac;

    private String name;
    private Double longitude;
    private Double latitude;

    @Enumerated(EnumType.STRING)
    private DeviceState state;

    @Enumerated(EnumType.STRING)
    private DeviceStatus status = DeviceStatus.OFFLINE;

    @Column(columnDefinition = "TEXT")
    private String publicKey;

    // --- Sở hữu (Tenant & User) ---
    @Column(name = "tenant_id", length = 36)
    private String tenantId;

    @Column(name = "user_id", length = 36)
    private String userId;

    @Column(name = "claimed_at")
    private Long claimedAt;

    @OneToMany(mappedBy = "device", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<DeviceFirmwareState> firmwareStates = new ArrayList<>();

    // --- Metadata phần cứng (Dùng để quyết định Firmware trên) ---
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "hw_metadata")
    private Map<String, Object> hwMetadata;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "description")
    private Map<String, Object> description;

    // --- Quan hệ ---
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "group_id")
    private DeviceGroup deviceGroup;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "user_configs")
    private Map<String, Object> userConfigs;
}