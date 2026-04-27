package com.smart_bin.order_service.dto.request;

public record CartItemDto(
        String sku,
        Integer quantity
) {}