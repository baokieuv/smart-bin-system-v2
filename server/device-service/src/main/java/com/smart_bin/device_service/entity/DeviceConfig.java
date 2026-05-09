package com.smart_bin.device_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.util.UUID;

@Entity
@Table(name = "device_configs")
@Getter
@Setter
public class DeviceConfig extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    @OneToOne
    @JoinColumn(name = "device_id", nullable = false, unique = true)
    private Device device;

    // --- Cấu hình do User (Chủ sở hữu) quyết định ---
    @Column(name = "polling_interval")
    private Integer pollingInterval = 300; // Mặc định 5 phút (300 giây)

    @Column(name = "full_threshold")
    private Double fullThreshold = 80.0; // Mức đầy báo động (%)

    // --- Cấu hình do Admin quyết định ---
    @ManyToOne
    @JoinColumn(name = "target_bin_firmware_id")
    private Firmware targetBinFirmware;

    @ManyToOne
    @JoinColumn(name = "target_desktop_firmware_id")
    private Firmware targetDesktopFirmware;
}