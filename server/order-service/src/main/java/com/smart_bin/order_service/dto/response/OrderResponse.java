package com.smart_bin.order_service.dto.response;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record OrderResponse(
        UUID orderId,
        BigDecimal totalAmount,
        String status,
        String paymentMethod,
        String paymentUrl, // Link để user bấm vào thanh toán (nếu chọn VNPAY/MOMO)
        List<OrderItemResponse> items
) {}