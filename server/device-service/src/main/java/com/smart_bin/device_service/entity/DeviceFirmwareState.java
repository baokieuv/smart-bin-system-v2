package com.smart_bin.device_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import com.smart_bin.device_service.common.FirmwareType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "device_firmware_states")
@Getter
@Setter
public class DeviceFirmwareState extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    // Liên kết về Device
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "device_id", nullable = false)
    private Device device;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FirmwareType type;

    @Column(name = "current_version")
    private String currentVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_firmware_id")
    private Firmware targetFirmware;
}