package com.smart_bin.product_service.service;

import com.smart_bin.product_service.dto.request.OrderEventPayload;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventListener {
    private final InventoryService inventoryService;
    private final ProductService productService;

    @KafkaListener(
            topics = "${app.kafka.topics.order-events}",
            groupId = "product-service-group"
    )
    public void handleOrderEvents(OrderEventPayload eventPayload) {
        log.info("Received order event: {} for Order ID: {}", eventPayload.orderType(), eventPayload.orderId());

        try {
            switch (eventPayload.orderType()) {
                case ORDER_PAID -> {
                    // Thanh toán thành công -> Trừ hẳn phần đã giữ chỗ
                    inventoryService.commitInventory(eventPayload.items());
                    productService.increaseSoldQuantity(eventPayload.items());
                }
                case ORDER_CANCELLED -> {
                    // Hủy đơn / Hết hạn -> Trả lại kho
                    inventoryService.releaseInventory(eventPayload.items());
                }
                default -> log.warn("Unknown event type: {}", eventPayload.orderType());
            }
        } catch (Exception e) {
            // Trong thực tế, bạn nên gửi message lỗi này vào Dead Letter Queue (DLQ) để xử lý sau
            log.error("Error processing order event {} for Order ID {}: {}",
                    eventPayload.orderType(), eventPayload.orderId(), e.getMessage());
            throw new RuntimeException("Kafka Listener failed, forcing retry", e);
        }
    }

}
