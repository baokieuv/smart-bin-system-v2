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
@Table(name = "device_profiles")
@Getter
@Setter
public class DeviceProfile extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private String name;

    private String description;

    // --- Thông số chung cho tất cả thiết bị thuộc Model này ---
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "admin_configs")
    private Map<String, Object> sharedSpecs;
}