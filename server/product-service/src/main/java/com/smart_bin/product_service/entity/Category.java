package com.smart_bin.product_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "categories", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"name", "active"})
})
@Getter
@Setter
public class Category extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator")
    private UUID id;

    private String name;

    private String description;
}
