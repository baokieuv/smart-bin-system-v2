package com.smart_bin.order_service.repository;

import com.smart_bin.order_service.entity.Order;
import com.smart_bin.order_service.entity.OrderItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface OrderItemRepository extends JpaRepository<OrderItem, UUID> {
}
