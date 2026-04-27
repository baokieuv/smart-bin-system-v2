package com.smart_bin.product_service.dto.request;

public record UpdateCategoryRequest(
        String name,
        String description
) {}