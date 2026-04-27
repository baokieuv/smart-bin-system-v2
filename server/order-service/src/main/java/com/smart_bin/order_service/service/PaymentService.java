package com.smart_bin.order_service.service;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.order_service.common.OrderStatus;
import com.smart_bin.order_service.dto.request.ReserveInventoryRequest;
import com.smart_bin.order_service.repository.OrderRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import com.smart_bin.order_service.entity.Order;

import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final OrderRepository orderRepository;
    private final OrderEventProducer orderEventProducer;

    public String generatePaymentUrl(Order order) {
        if ("COD".equalsIgnoreCase(order.getPaymentMethod())) {
            return null; // Trả tiền mặt thì không cần link
        }

        // TODO: Viết logic mã hóa HMAC SHA512 để sinh URL VNPay/MoMo ở đây
        // Trả về URL giả lập
        return "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=" + order.getId();
    }

    @Transactional
    public void processPaymentWebhook(String orderIdStr, String transactionId, boolean isSuccess) {
        UUID orderId = UUID.fromString(orderIdStr);
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Order not found"));

        if (order.getStatus() != OrderStatus.PENDING_PAYMENT) {
            log.warn("Order {} is already processed. Current status: {}", orderId, order.getStatus());
            return;
        }

        order.setPaymentTransactionId(transactionId);

        var inventoryItems = order.getItems().stream()
                .map(item -> new ReserveInventoryRequest.InventoryItemDto(item.getProductSku(), (long) item.getQuantity()))
                .collect(Collectors.toList());

        if (isSuccess) {
            order.setStatus(OrderStatus.PAID);
            orderRepository.save(order);
            // Kích hoạt SAGA: Báo cho Product-service trừ hẳn kho (Commit)
            orderEventProducer.publishOrderEvent(orderIdStr, "ORDER_PAID", inventoryItems);
        } else {
            order.setStatus(OrderStatus.FAILED);
            orderRepository.save(order);
            // Kích hoạt SAGA: Báo cho Product-service nhả kho ra (Release)
            orderEventProducer.publishOrderEvent(orderIdStr, "ORDER_CANCELLED", inventoryItems);
        }
    }
}
