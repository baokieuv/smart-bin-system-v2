package com.smart_bin.iam_service.entity;

import com.smart_bin.core.common.UserRole;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "tenants")
@Getter
@Setter
public class Tenant extends User {
    public Tenant() {
        super();
        this.setRole(UserRole.ADMIN);
    }
}