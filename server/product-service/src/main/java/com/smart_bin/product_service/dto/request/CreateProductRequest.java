package com.smart_bin.product_service.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

public record CreateProductRequest(
        @NotBlank(message = "Product name is required")
        String name,

        String description,

        @NotNull(message = "Price is required")
        @Min(value = 0, message = "Price must be greater than or equal to 0")
        BigDecimal price,

        @NotBlank(message = "SKU is required")
        String sku,

        String imageUrl,

        @NotNull(message = "Category ID is required")
        String categoryId
) {}