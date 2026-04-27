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
import com.smart_bin.order_service.entity.Order;
import com.smart_bin.order_service.entity.OrderItem;
import com.smart_bin.order_service.mapper.OrderMapper;
import com.smart_bin.order_service.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

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

    @Transactional(rollbackFor = Exception.class)
    public OrderResponse checkout(String userId, CheckoutRequest request) {
        // 1. Lấy giỏ hàng
        List<CartItemDto> cartItems = cartService.getCartItems(userId);
        if (cartItems.isEmpty()) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Giỏ hàng của bạn đang trống");
        }

        // 2. Giữ chỗ tồn kho (Reserve Inventory)
        reserveInventory(cartItems);

        // 3. Build & Save Order
        Order order = buildOrderFromCart(userId, request, cartItems);
        orderRepository.save(order);

        // 4. Dọn dẹp giỏ hàng
        cartService.clearCart(userId);

        // 5. Sinh Link Thanh Toán
        String paymentUrl = paymentService.generatePaymentUrl(order);
        log.info("Order created successfully: {}", order.getId());

        return orderMapper.toResponse(order, paymentUrl);
    }

    public Page<OrderResponse> getMyOrders(String userId, int page, int size) {
        int pageIndex = Math.max(page - 1, 0);
        Pageable pageable = PageRequest.of(pageIndex, size);

        return orderRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable)
                .map(order -> orderMapper.toResponse(order, paymentService.generatePaymentUrl(order)));
    }

    public OrderResponse getOrderDetail(String userId, String orderIdStr) {
        Order order = getOrderByIdAndValidateOwnership(userId, orderIdStr);
        return orderMapper.toResponse(order, paymentService.generatePaymentUrl(order));
    }

    @Transactional(rollbackFor = Exception.class)
    public OrderResponse updateOrder(String userId, String orderIdStr, UpdateOrderRequest request) {
        Order order = getOrderByIdAndValidateOwnership(userId, orderIdStr);

        // Kiểm tra trạng thái: Không cho phép cập nhật nếu đơn đã giao hoặc kết thúc
        if (order.getStatus() == OrderStatus.SHIPPING ||
                order.getStatus() == OrderStatus.COMPLETED ||
                order.getStatus() == OrderStatus.CANCELLED ||
                order.getStatus() == OrderStatus.FAILED) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Không thể cập nhật đơn hàng ở trạng thái hiện tại");
        }

        // Cập nhật thông tin từ request vào entity
        orderMapper.updateOrderFromRequest(request, order);

        orderRepository.save(order);

        log.info("Order {} updated by user {}", order.getId(), userId);

        return orderMapper.toResponse(order, paymentService.generatePaymentUrl(order));
    }

    @Transactional(rollbackFor = Exception.class)
    public String cancelOrder(String userId, String orderIdStr) {
        Order order = getOrderByIdAndValidateOwnership(userId, orderIdStr);

        if (order.getStatus() != OrderStatus.PENDING_PAYMENT) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Chỉ có thể hủy đơn hàng đang chờ thanh toán");
        }

        order.setStatus(OrderStatus.CANCELLED);
        orderRepository.save(order);

        publishOrderCancelledEvent(order);
        return "Hủy đơn hàng thành công";
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

    private void reserveInventory(List<CartItemDto> cartItems) {
        List<ReserveInventoryRequest.InventoryItemDto> reserveItems = cartItems.stream()
                .map(item -> new ReserveInventoryRequest.InventoryItemDto(item.sku(), (long) item.quantity()))
                .toList();
        try {
            // TODO check logic
            productClient.reserveInventory(new ReserveInventoryRequest(reserveItems));
        } catch (Exception e) {
            log.error("Failed to reserve inventory", e);
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Không đủ hàng trong kho cho một số sản phẩm");
        }
    }

    private Order buildOrderFromCart(String userId, CheckoutRequest request, List<CartItemDto> cartItems) {
        // Dùng mapper map address và paymentMethod
        Order order = orderMapper.toEntity(request);
        order.setUserId(userId);
        order.setStatus(OrderStatus.PENDING_PAYMENT);

        BigDecimal totalAmount = BigDecimal.ZERO;

        for (CartItemDto cartItem : cartItems) {
            OrderItem orderItem = new OrderItem();
            orderItem.setProductSku(cartItem.sku());
            orderItem.setQuantity(cartItem.quantity());

            // TODO: Call ProductService to get real price and name using SKU
            BigDecimal pricePerItem = BigDecimal.valueOf(100000); // GIẢ LẬP
            orderItem.setProductName("Smart Bin Product " + cartItem.sku()); // GIẢ LẬP
            orderItem.setPrice(pricePerItem);

            order.addItem(orderItem);
            totalAmount = totalAmount.add(pricePerItem.multiply(BigDecimal.valueOf(cartItem.quantity())));
        }

        order.setTotalAmount(totalAmount);
        return order;
    }

    private void publishOrderCancelledEvent(Order order) {
        List<ReserveInventoryRequest.InventoryItemDto> inventoryItems = order.getItems().stream()
                .map(item -> new ReserveInventoryRequest.InventoryItemDto(item.getProductSku(), (long) item.getQuantity()))
                .toList();

        orderEventProducer.publishOrderEvent(order.getId().toString(), OrderType.ORDER_CANCELLED, inventoryItems);
    }
}
