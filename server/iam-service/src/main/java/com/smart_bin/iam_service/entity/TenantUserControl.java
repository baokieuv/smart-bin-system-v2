package com.smart_bin.iam_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import com.smart_bin.iam_service.common.UserState;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "tenant_user_controls")
@Getter
@Setter
public class TenantUserControl extends BaseEntity {

    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    @Column(nullable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING) // Store as a readable string (e.g., "ACTIVE")
    private UserState state;
}

