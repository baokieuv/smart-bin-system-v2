package com.smart_bin.order_service.utils;

import com.smart_bin.core.common.OrderType;
import com.smart_bin.order_service.common.OrderStatus;
import com.smart_bin.order_service.dto.request.ReserveInventoryRequest;
import com.smart_bin.order_service.entity.Order;
import com.smart_bin.order_service.repository.OrderRepository;
import com.smart_bin.order_service.service.OrderEventProducer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderCleanupTask {
    private final OrderRepository orderRepository;
    private final OrderEventProducer orderEventProducer;

    @Scheduled(cron = "0 */5 * * * *")
    @Transactional
    public void cancelExpiredOrders() {
        log.info("Bắt đầu quét các đơn hàng PENDING_PAYMENT quá hạn...");

        LocalDateTime expireTime = LocalDateTime.now().minusMinutes(15);

        List<Order> expiredOrders = orderRepository.findByStatusAndCreatedDateBefore(OrderStatus.PENDING_PAYMENT, expireTime);

        for (Order order : expiredOrders) {
            order.setStatus(OrderStatus.CANCELLED);
            orderRepository.save(order);

            List<ReserveInventoryRequest.InventoryItemDto> inventoryItems = order.getItems().stream()
                    .map(item -> new ReserveInventoryRequest.InventoryItemDto(item.getProductSku(), (long) item.getQuantity()))
                    .toList();

            orderEventProducer.publishOrderEvent(order.getId().toString(), OrderType.ORDER_CANCELLED, inventoryItems);
            log.info("Đã hủy tự động và nhả kho cho đơn hàng quá hạn: {}", order.getId());
        }
    }
}
