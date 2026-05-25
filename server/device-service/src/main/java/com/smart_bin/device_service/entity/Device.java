package com.smart_bin.device_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import com.smart_bin.device_service.common.DeviceState;
import com.smart_bin.device_service.common.DeviceStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

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
    private DeviceStatus status;

    @Column(columnDefinition = "TEXT")
    private String publicKey;

    // --- Sở hữu (Tenant & User) ---
    @Column(name = "tenant_id", length = 36)
    private String tenantId;

    @Column(name = "user_id", length = 36)
    private String userId;

    @Column(name = "claimed_at")
    private Long claimedAt;

    // --- Firmware Tracking (Current) ---
    @Column(name = "desktop_version")
    private String desktopVersion; // Version thiết bị đang báo lên

    @Column(name = "bin_version")
    private String binVersion; // Version thiết bị đang báo lên

    // --- Firmware Routing (Target do Hệ thống/Admin tự map) ---
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_bin_firmware_id")
    private Firmware targetBinFirmware;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_desktop_firmware_id")
    private Firmware targetDesktopFirmware;

    // --- Metadata phần cứng (Dùng để quyết định Firmware trên) ---
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "hw_metadata")
    private Map<String, Object> hwMetadata;

    // --- Quan hệ ---
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "group_id")
    private DeviceGroup deviceGroup;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "profile_id")
    private DeviceProfile deviceProfile;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "user_configs")
    private Map<String, Object> userConfigs;
}