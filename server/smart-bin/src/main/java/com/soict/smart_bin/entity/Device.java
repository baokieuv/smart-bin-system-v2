package com.soict.smart_bin.entity;

import com.soict.smart_bin.common.DeviceState;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "devices")
@Getter
@Setter
public class Device extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    private String accessToken;

    private String deviceId;

    @Column(nullable = false)
    private String mac;

    private String name;

    private Double longitude;

    private Double latitude;

    @Enumerated(EnumType.STRING)
    private DeviceState state;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;
}