package com.smart_bin.device_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.util.UUID;

@Entity
@Table(name = "device_groups")
@Getter
@Setter
public class DeviceGroup extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    @Column(nullable = false, unique = true)
    private String code; // Mã nhóm (VD: SMART_BIN_60L_V1)

    @Column(nullable = false)
    private String name; // Tên hiển thị (VD: Thùng rác thông minh 60 Lít V1)

    @Column(nullable = false)
    private Double binHeight; // Chiều cao cố định (cm)

    private String description; // Mô tả thêm
}