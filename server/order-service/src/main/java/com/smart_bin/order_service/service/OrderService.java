package com.smart_bin.order_service.service;

import com.smart_bin.core.common.OrderType;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.order_service.common.OrderStatus;
import com.smart_bin.order_service.config.ProductClient;
import com.smart_bin.order_service.dto.request.CartItemDto;
import com.smart_bin.order_service.dto.request.CheckoutRequest;
import com.smart_bin.order_service.dto.request.ReserveInventoryRequest;
import com.smart_bin.order_service.dto.request.UpdateOrderRequest;
import com.smart_bin.order_service.dto.response.OrderResponse;
import com.smart_bin.order_service.dto.response.ProductResponse;
import com.smart_bin.order_service.entity.Order;
import com.smart_bin.order_service.entity.OrderItem;
import com.smart_bin.order_service.mapper.OrderMapper;
import com.smart_bin.order_service.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderService {

    private final CartService cartService;
    private final ProductClient productClient;
    private final OrderRepository orderRepository;
    private final PaymentService paymentService;
    private final OrderEventProducer orderEventProducer;
    private final OrderMapper orderMapper;

    @Value("${app.feign.product-service.internal-secret:SUPER_SECRET_INTERNAL_KEY}")
    private String internalSecret;

    @Transactional(rollbackFor = Exception.class)
    public OrderResponse checkout(String userId, CheckoutRequest request, String ipAddress) {

        // --- Validate giỏ hàng ---
        List<CartItemDto> cartItems = cartService.getCartItems(userId);
        if (cartItems == null || cartItems.isEmpty()) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Giỏ hàng của bạn đang trống");
        }

        // --- Bước 1: Tạo Order skeleton trước khi gọi external service ---
        Order order = orderMapper.toEntity(request);
        order.setUserId(userId);
        order.setStatus(OrderStatus.PENDING_INVENTORY); // trạng thái trung gian
        orderRepository.save(order);

        log.info("Order skeleton created: {} for user: {}", order.getId(), userId);

        List<ReserveInventoryRequest.InventoryItemDto> reserveItems = cartItems.stream()
                .map(item -> new ReserveInventoryRequest.InventoryItemDto(item.sku(), (long) item.quantity()))
                .toList();

        try {
            productClient.reserveInventory(internalSecret, new ReserveInventoryRequest(reserveItems));
        } catch (Exception e) {
            log.error("Failed to reserve inventory for order {}. Rolling back.", order.getId(), e);
            // Compensating: đánh dấu order FAILED để không bị treo ở PENDING_INVENTORY
            order.setStatus(OrderStatus.FAILED);
            orderRepository.save(order);
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Không đủ hàng trong kho cho một số sản phẩm");
        }

        // --- Bước 3: Lấy thông tin sản phẩm để build order items ---
        List<String> skus = cartItems.stream().map(CartItemDto::sku).toList();

        var productResponseOpt = productClient.getProductsBySkus(skus);
        if (productResponseOpt == null || productResponseOpt.data() == null) {
            // Compensating: release inventory đã reserve + đánh dấu FAILED
            log.error("Failed to fetch product info for order {}. Releasing inventory.", order.getId());

            publishRollbackInventoryEvent(order.getId().toString(), reserveItems);

            order.setStatus(OrderStatus.FAILED);
            orderRepository.save(order);
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Không thể lấy thông tin sản phẩm từ hệ thống");
        }

        // --- Bước 4: Build order items & tính tổng tiền ---
        Map<String, ProductResponse> productMap = productResponseOpt.data().stream()
                .collect(Collectors.toMap(ProductResponse::sku, p -> p));

        BigDecimal totalAmount = BigDecimal.ZERO;

        for (CartItemDto cartItem : cartItems) {
            ProductResponse productData = productMap.get(cartItem.sku());

            if (productData == null) {
                publishRollbackInventoryEvent(order.getId().toString(), reserveItems);

                order.setStatus(OrderStatus.FAILED);
                orderRepository.save(order);
                throw new ApiException(CoreErrorCode.BAD_REQUEST,
                        "Không tìm thấy hoặc sản phẩm đã ngừng bán: " + cartItem.sku());
            }

            if (productData.price() == null || productData.price().compareTo(BigDecimal.ZERO) < 0) {
                publishRollbackInventoryEvent(order.getId().toString(), reserveItems);

                order.setStatus(OrderStatus.FAILED);
                orderRepository.save(order);
                throw new ApiException(CoreErrorCode.BAD_REQUEST,
                        "Sản phẩm " + cartItem.sku() + " chưa được thiết lập giá hợp lệ");
            }

            OrderItem orderItem = new OrderItem();
            orderItem.setProductSku(cartItem.sku());
            orderItem.setQuantity(cartItem.quantity());
            orderItem.setProductName(productData.name());
            orderItem.setPrice(productData.price());

            order.addItem(orderItem);
            totalAmount = totalAmount.add(orderItem.getPrice().multiply(BigDecimal.valueOf(cartItem.quantity())));
        }

        // --- Bước 5: Finalize order ---
        order.setTotalAmount(totalAmount);

        if ("COD".equalsIgnoreCase(request.paymentMethod())) {
            order.setStatus(OrderStatus.PROCESSING); // Chuyển thẳng sang xử lý
            cartService.clearCart(userId);
        } else {
            order.setStatus(OrderStatus.PENDING_PAYMENT); // VNPay thì chờ thanh toán
        }

        orderRepository.save(order);

        // COD: clear cart ngay sau khi tạo đơn (không cần chờ payment)
        if ("COD".equalsIgnoreCase(request.paymentMethod())) {
            orderEventProducer.publishOrderEvent(
                    order.getId().toString(),
                    OrderType.ORDER_PAID, // Mượn event PAID để trigger hàm commitInventory bên kia
                    reserveItems
            );
        }

        log.info("Order {} created successfully for user {}. Total: {}", order.getId(), userId, totalAmount);

        String paymentUrl = getSafePaymentUrl(order, ipAddress);
        return orderMapper.toResponse(order, paymentUrl);
    }

    public Page<OrderResponse> getMyOrders(String userId, int page, int size, String ipAddress) {
        int pageIndex = Math.max(page - 1, 0);
        Pageable pageable = PageRequest.of(pageIndex, size);

        return orderRepository.findByUserIdOrderByCreatedDateDesc(userId, pageable)
                .map(order -> {
                    String paymentUrl = getSafePaymentUrl(order, ipAddress);
                    return orderMapper.toResponse(order, paymentUrl);
                });
    }

    public OrderResponse getOrderDetail(String userId, String orderIdStr, String ipAddress) {
        Order order = getOrderByIdAndValidateOwnership(userId, orderIdStr);
        String paymentUrl = getSafePaymentUrl(order, ipAddress);
        return orderMapper.toResponse(order, paymentUrl);
    }

    @Transactional(rollbackFor = Exception.class)
    public OrderResponse updateOrder(String userId, String orderIdStr, UpdateOrderRequest request, String ipAddress) {
        Order order = getOrderByIdAndValidateOwnership(userId, orderIdStr);

        if (order.getStatus() != OrderStatus.PENDING_PAYMENT) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST,
                    "Chỉ có thể cập nhật đơn hàng đang chờ thanh toán. " +
                            "Trạng thái hiện tại: " + order.getStatus());
        }

        orderMapper.updateOrderFromRequest(request, order);
        orderRepository.save(order);

        log.info("Order {} updated by user {}", order.getId(), userId);

        String paymentUrl = getSafePaymentUrl(order, ipAddress);
        return orderMapper.toResponse(order, paymentUrl);
    }

    @Transactional(rollbackFor = Exception.class)
    public String cancelOrder(String userId, String orderIdStr) {
        Order order = getOrderByIdAndValidateOwnership(userId, orderIdStr);

        if (order.getStatus() != OrderStatus.PENDING_PAYMENT
                && order.getStatus() != OrderStatus.PAID) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST,
                    "Không thể huỷ đơn hàng ở trạng thái: " + order.getStatus() +
                            ". Chỉ có thể huỷ khi đang chờ thanh toán hoặc đã thanh toán (chưa giao hàng).");
        }

        boolean wasPaid = order.getStatus() == OrderStatus.PAID;

        order.setStatus(OrderStatus.CANCELLED);
        orderRepository.save(order);

        publishOrderCancelledEvent(order);

        if (wasPaid) {
            // Thông báo cho user biết sẽ được hoàn tiền
            log.info("Order {} cancelled after payment. Refund event will be processed by Refund Service.", order.getId());
            return "Huỷ đơn hàng thành công. Tiền hoàn sẽ được xử lý trong 3-5 ngày làm việc.";
        }

        return "Huỷ đơn hàng thành công";
    }

    private Order getOrderByIdAndValidateOwnership(String userId, String orderIdStr) {
        UUID orderId;
        try {
            orderId = UUID.fromString(orderIdStr);
        } catch (IllegalArgumentException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Định dạng mã đơn hàng không hợp lệ");
        }

        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Không tìm thấy đơn hàng"));

        if (!order.getUserId().equals(userId)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Bạn không có quyền truy cập đơn hàng này");
        }
        return order;
    }

    private void publishOrderCancelledEvent(Order order) {
        List<ReserveInventoryRequest.InventoryItemDto> inventoryItems = order.getItems().stream()
                .map(item -> new ReserveInventoryRequest.InventoryItemDto(
                        item.getProductSku(), (long) item.getQuantity()))
                .toList();
        orderEventProducer.publishOrderEvent(order.getId().toString(), OrderType.ORDER_CANCELLED, inventoryItems);
    }

    private String getSafePaymentUrl(Order order, String ipAddress) {
        if (order.getStatus() == OrderStatus.PENDING_PAYMENT
                && !"COD".equalsIgnoreCase(order.getPaymentMethod())) {
            try {
                return paymentService.generatePaymentUrl(order, ipAddress);
            } catch (Exception ex) {
                log.error("Failed to generate payment URL for order {}", order.getId(), ex);
                return null;
            }
        }
        return null;
    }

    private void publishRollbackInventoryEvent(String orderId, List<ReserveInventoryRequest.InventoryItemDto> reserveItems) {
        log.info("Publishing Kafka event to release inventory for failed order: {}", orderId);

        orderEventProducer.publishOrderEvent(orderId, OrderType.ORDER_CANCELLED, reserveItems);
    }


//    private void safelyReleaseInventory(List<ReserveInventoryRequest.InventoryItemDto> items, String orderId) {
//        try {
//            productClient.releaseInventory(new ReserveInventoryRequest(items));
//            log.info("Released inventory for failed order: {}", orderId);
//        } catch (Exception e) {
//            // ALERT: Inventory đang bị hold orphan — cần có scheduled job dọn dẹp
//            log.error("CRITICAL: Failed to release inventory for order {}. " +
//                    "Manual intervention required. Items: {}", orderId, items, e);
//        }
//    }

}
