package com.smart_bin.product_service.dto.request;

import com.smart_bin.core.common.OrderType;

import java.util.List;

public record OrderEventPayload(
        String orderId,
        OrderType orderType, // Ví dụ: "ORDER_PAID", "ORDER_CANCELLED"
        List<InventoryItemDto> items
) {}