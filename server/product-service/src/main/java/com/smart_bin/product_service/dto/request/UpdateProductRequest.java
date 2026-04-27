package com.smart_bin.product_service.dto.request;

import jakarta.validation.constraints.Min;

import java.math.BigDecimal;
import java.util.UUID;

public record UpdateProductRequest(
        String name,

        String description,

        @Min(value = 0, message = "Price must be greater than or equal to 0")
        BigDecimal price,

        String imageUrl,

        UUID categoryId
) {}