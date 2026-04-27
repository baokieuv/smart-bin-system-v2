package com.smart_bin.order_service.service;

import com.smart_bin.core.common.OrderType;
import com.smart_bin.order_service.dto.request.ReserveInventoryRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventProducer {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${app.kafka.topics.order-events}")
    private String orderEventsTopic;

    public record OrderEventPayload(String orderId, OrderType orderType, List<ReserveInventoryRequest.InventoryItemDto> items) {}

    public void publishOrderEvent(String orderId, OrderType orderType, List<ReserveInventoryRequest.InventoryItemDto> items) {
        OrderEventPayload payload = new OrderEventPayload(orderId, orderType, items);
        kafkaTemplate.send(orderEventsTopic, orderId, payload);
        log.info("Published {} event for Order ID: {}", orderType, orderId);
    }
}