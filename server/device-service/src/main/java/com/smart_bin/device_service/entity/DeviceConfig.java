package com.smart_bin.device_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.Map;
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
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "user_configs", nullable = false)
    private Map<String, Object> userConfigs;
}