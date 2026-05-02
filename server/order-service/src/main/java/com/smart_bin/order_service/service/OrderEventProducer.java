package com.smart_bin.order_service.service;

import com.smart_bin.core.common.OrderType;
import com.smart_bin.order_service.dto.request.ReserveInventoryRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventProducer {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${app.kafka.topics.order-events}")
    private String orderEventsTopic;

    public record OrderEventPayload(
            String orderId,
            OrderType orderType,
            List<ReserveInventoryRequest.InventoryItemDto> items
    ) {}


    public void publishOrderEvent(String orderId, OrderType orderType,
                                  List<ReserveInventoryRequest.InventoryItemDto> items) {
        OrderEventPayload payload = new OrderEventPayload(orderId, orderType, items);

        CompletableFuture<SendResult<String, Object>> future =
                kafkaTemplate.send(orderEventsTopic, orderId, payload);

        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("Failed to publish {} event for Order ID: {}. Error: {}",
                        orderType, orderId, ex.getMessage(), ex);
                // NOTE: Trong production, đây là nơi trigger retry hoặc dead-letter queue.
                // Với Outbox Pattern, message đã được persist trong DB transaction
                // nên có thể retry an toàn mà không lo duplicate.
            } else {
                log.info("Published {} event for Order ID: {} | partition={} offset={}",
                        orderType, orderId,
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
            }
        });
    }
}