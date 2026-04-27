package com.smart_bin.order_service.dto.request;

import jakarta.validation.constraints.NotBlank;

public record CheckoutRequest(
        @NotBlank(message = "Shipping address is required")
        String shippingAddress,

        @NotBlank(message = "Payment method is required (e.g., VNPAY, MOMO, COD)")
        String paymentMethod
) {}