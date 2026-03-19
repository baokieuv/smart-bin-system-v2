package com.soict.smart_bin.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.soict.smart_bin.common.NotificationType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table
@Getter
@Setter
public class Notification extends BaseEntity{

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String actionId;

    private String title;

    private String message;

    @Enumerated(EnumType.STRING)
    private NotificationType type;

    private String targetUrl;

    private boolean isRead = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;
}
