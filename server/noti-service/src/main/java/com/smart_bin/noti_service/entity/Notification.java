package com.smart_bin.noti_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import com.smart_bin.noti_service.common.NotificationType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "notifications") // Nên đặt tên bảng số nhiều cho chuẩn REST
@Getter
@Setter
public class Notification extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String actionId;

    private String title;

    private String message;

    @Enumerated(EnumType.STRING)
    private NotificationType type;

    private String targetUrl;

    @Column(nullable = false)
    private boolean isRead = false;

    @Column(name = "keycloak_id", nullable = false, length = 36)
    private String keycloakId;
}