package com.soict.smart_bin.entity;

import com.soict.smart_bin.common.NotificationType;
import jakarta.persistence.*;

import java.util.UUID;

public class Notification extends BaseEntity{

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String userId;

    private String actionId;

    private String message;

    @Enumerated(EnumType.STRING)
    private NotificationType type;

    private String targetUrl;

    private boolean isRead = false;
}
