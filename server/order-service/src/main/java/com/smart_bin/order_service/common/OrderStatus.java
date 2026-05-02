package com.smart_bin.order_service.common;

public enum OrderStatus {
    PENDING_INVENTORY,
    PENDING_PAYMENT, // Vừa tạo, đang chờ thanh toán
    PAID,            // Đã thanh toán thành công
    PROCESSING,      // Đang chuẩn bị hàng
    SHIPPING,        // Đang giao
    COMPLETED,       // Hoàn thành
    CANCELLED,       // Bị hủy (do user hoặc quá hạn)
    FAILED           // Thanh toán thất bại
}