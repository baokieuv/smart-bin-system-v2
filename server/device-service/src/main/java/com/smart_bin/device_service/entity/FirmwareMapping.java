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
@Table(name = "firmware_mappings")
@Getter
@Setter
public class FirmwareMapping extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata_criteria", nullable = false)
    private Map<String, Object> metadataCriteria; // VD: {"board": "esp32", "ram": "4mb"}

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_firmware_id", nullable = false)
    private Firmware targetFirmware;

    @Column(nullable = false)
    private Integer priority = 0; // Độ ưu tiên nếu 1 thiết bị khớp nhiều rule (số càng lớn ưu tiên càng cao)

    @Column(name = "is_active", nullable = false)
    private boolean active = true;
}