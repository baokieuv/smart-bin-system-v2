package com.smart_bin.product_service.dto.response;

import java.math.BigDecimal;
import java.util.UUID;

public record ProductResponse(
        UUID id,
        String name,
        String description,
        BigDecimal price,
        String sku,
        String imageUrl,
        CategoryResponse category,
        Long quantityAvailable
) {}