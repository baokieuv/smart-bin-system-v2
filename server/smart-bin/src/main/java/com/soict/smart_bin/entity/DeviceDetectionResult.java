package com.soict.smart_bin.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.soict.smart_bin.common.DetectionFeedback;
import com.soict.smart_bin.common.WasteType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "detection_results")
@Getter
@Setter
public class DeviceDetectionResult extends BaseEntity{

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    String imageUrl;

    @Enumerated(EnumType.STRING)
    WasteType type;

    Double confidence;

    @Enumerated(EnumType.STRING)
    DetectionFeedback feedback;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "device_id")
    @JsonIgnore
    private Device device;

}
