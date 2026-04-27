package com.smart_bin.order_service.dto.request;

import jakarta.validation.constraints.NotBlank;

public record UpdateOrderRequest(
        @NotBlank(message = "Địa chỉ giao hàng không được để trống")
        String shippingAddress
) {}
