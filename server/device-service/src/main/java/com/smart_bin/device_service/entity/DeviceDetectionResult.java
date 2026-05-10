package com.smart_bin.device_service.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.smart_bin.core.entity.BaseEntity;
import com.smart_bin.device_service.common.DetectionFeedback;
import com.smart_bin.device_service.common.WasteType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "detection_results")
@Getter
@Setter
public class DeviceDetectionResult extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    String imageUrl;

    @Enumerated(EnumType.STRING)
    WasteType type;

    Double confidence;

    @Enumerated(EnumType.STRING)
    DetectionFeedback feedback;

    @Column(name = "detected_at")
    private Long detectedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "actual_type")
    private WasteType actualType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "device_id")
    @JsonIgnore
    private Device device;

}
