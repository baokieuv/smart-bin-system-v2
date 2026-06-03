package com.smart_bin.device_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import com.smart_bin.device_service.dto.request.AlarmRuleDto;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "device_groups")
@Getter
@Setter
public class DeviceGroup extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    @Column(unique = true)
    private String tbProfileId;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(name = "tenant_id", nullable = false, length = 36)
    private String tenantId; // Nhóm này thuộc về Tenant nào

    @Column(nullable = false)
    private String name; // Tên nhóm (VD: Tòa nhà S1, Tầng 1, Sân vườn)

    private String description;

    @Column(name = "is_default", nullable = false)
    private boolean isDefault = false;

    // Configuration for devices group
    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> sharedSpecs;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "alarm_rules")
    private List<AlarmRuleDto> alarmRules;

    // --- Hỗ trợ cấu trúc cây (Hierarchical) ---
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private DeviceGroup parent;
}