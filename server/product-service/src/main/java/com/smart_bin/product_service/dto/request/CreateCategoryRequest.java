package com.smart_bin.product_service.dto.request;

import jakarta.validation.constraints.NotBlank;

public record CreateCategoryRequest(
        @NotBlank(message = "Category name is required")
        String name,

        String description
) {}