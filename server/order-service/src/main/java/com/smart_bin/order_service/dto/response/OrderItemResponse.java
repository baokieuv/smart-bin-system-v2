package com.smart_bin.order_service.dto.response;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderItemResponse(
        UUID id,
        String productSku,
        String productName,
        BigDecimal price,
        Integer quantity
) {}
