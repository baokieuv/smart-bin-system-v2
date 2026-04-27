package com.smart_bin.order_service.entity;

import com.smart_bin.core.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "order_items")
@Getter
@Setter
public class OrderItem extends BaseEntity {
    @Id
    @GeneratedValue(generator = "uuid-v7-generator") // Hoặc UUID random mặc định
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @Column(nullable = false)
    private String productSku;

    @Column(nullable = false)
    private String productName; // Lưu cứng tên tại thời điểm mua

    @Column(nullable = false)
    private BigDecimal price;   // Lưu cứng giá tại thời điểm mua

    @Column(nullable = false)
    private Integer quantity;
}