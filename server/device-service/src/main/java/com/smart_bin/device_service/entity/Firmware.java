package com.smart_bin.device_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import com.smart_bin.device_service.common.FirmwareType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.util.UUID;

@Entity
@Table(name = "firmwares")
@Getter
@Setter
public class Firmware extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    @Column(nullable = false, unique = true)
    private String version;

    private String description;

    @Column(nullable = false)
    private String objectPath; // Đường dẫn file trên MinIO

    @Column(nullable = false, length = 1000)
    private String signature; // Chữ ký số do Backend tạo ra

    @Column(nullable = false)
    private boolean active = true; // Dùng cho xóa mềm (Soft delete)

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FirmwareType type;
}