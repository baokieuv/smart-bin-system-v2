package com.smart_bin.order_service.service;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.order_service.common.OrderStatus;
import com.smart_bin.order_service.config.ProductClient;
import com.smart_bin.order_service.dto.request.CartItemDto;
import com.smart_bin.order_service.dto.request.CheckoutRequest;
import com.smart_bin.order_service.dto.request.ReserveInventoryRequest;
import com.smart_bin.order_service.dto.response.OrderResponse;
import com.smart_bin.order_service.entity.Order;
import com.smart_bin.order_service.entity.OrderItem;
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

    @Transactional(rollbackFor = Exception.class)
    public OrderResponse checkout(String userId, CheckoutRequest request) {
        List<CartItemDto> cartItems = cartService.getCartItems(userId);
        if (cartItems.isEmpty()) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Cart is empty");
        }

        // 2. Giao tiếp Product Service: Giữ chỗ tồn kho (Reserve Inventory)
        List<ReserveInventoryRequest.InventoryItemDto> reserveItems = cartItems.stream()
                .map(item -> new ReserveInventoryRequest.InventoryItemDto(item.sku(), (long) item.quantity()))
                .toList();

        try {
            productClient.reserveInventory(new ReserveInventoryRequest(reserveItems));
        } catch (Exception e) {
            log.error("Failed to reserve inventory", e);
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Not enough stock for some products");
        }

        // 3. Tạo Đơn hàng
        Order order = new Order();
        order.setUserId(userId);
        order.setShippingAddress(request.shippingAddress());
        order.setPaymentMethod(request.paymentMethod());
        order.setStatus(OrderStatus.PENDING_PAYMENT);

        BigDecimal totalAmount = BigDecimal.ZERO;

        // 4. Lấy giá sản phẩm & Tạo Order Items
        // LƯU Ý: Trong thực tế, bạn cần gọi API lấy chi tiết Product từ product-service
        // để lấy tên và giá chính xác. Ở đây tôi viết giả lập logic.
        for (CartItemDto cartItem : cartItems) {
            OrderItem orderItem = new OrderItem();
            orderItem.setProductSku(cartItem.sku());
            orderItem.setQuantity(cartItem.quantity());

            // TODO: Fetch real price and name from product-service using SKU
            BigDecimal pricePerItem = BigDecimal.valueOf(100000); // GIẢ LẬP
            orderItem.setProductName("Smart Bin Product " + cartItem.sku()); // GIẢ LẬP
            orderItem.setPrice(pricePerItem);

            order.addItem(orderItem);
            totalAmount = totalAmount.add(pricePerItem.multiply(BigDecimal.valueOf(cartItem.quantity())));
        }

        order.setTotalAmount(totalAmount);
        orderRepository.save(order);

        // 5. Xóa giỏ hàng
        cartService.clearCart(userId);

        // 6. Sinh Link Thanh Toán
        String paymentUrl = paymentService.generatePaymentUrl(order);

        log.info("Order created successfully: {}", order.getId());
        return new OrderResponse(order.getId(), order.getTotalAmount(), order.getStatus().name(), paymentUrl);
    }

    // 1. Xem danh sách đơn hàng (Có phân trang)
    public Page<OrderResponse> getMyOrders(String userId, int page, int size) {
        int pageIndex = Math.max(page - 1, 0); // Đảm bảo page >= 0
        Pageable pageable = PageRequest.of(pageIndex, size);

        Page<Order> orders = orderRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable);

        // Sử dụng Mapper để chuyển đổi Entity -> DTO
        // Nếu chưa có hàm orderMapper.toResponse thì bạn tạo thêm trong interface OrderMapper nhé
        return orders.map(order -> new OrderResponse(
                order.getId(),
                order.getTotalAmount(),
                order.getStatus().name(),
                paymentService.generatePaymentUrl(order) // Có thể sinh lại link nếu còn hạn
        ));
    }

    // 2. Xem chi tiết 1 đơn hàng
    public OrderResponse getOrderDetail(String userId, String orderIdStr) {
        UUID orderId = UUID.fromString(orderIdStr);
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Không tìm thấy đơn hàng"));

        // Bảo mật: Kiểm tra xem đơn hàng này có đúng là của user đang request không
        if (!order.getUserId().equals(userId)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Bạn không có quyền truy cập đơn hàng này");
        }

        return new OrderResponse(
                order.getId(),
                order.getTotalAmount(),
                order.getStatus().name(),
                paymentService.generatePaymentUrl(order)
        );
        // Lưu ý: Nếu OrderResponse của bạn có List<OrderItemResponse> items, hãy map thêm ở đây.
    }

    // 3. User tự hủy đơn hàng
    @Transactional(rollbackFor = Exception.class)
    public String cancelOrder(String userId, String orderIdStr) {
        UUID orderId = UUID.fromString(orderIdStr);
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Không tìm thấy đơn hàng"));

        // Bảo mật: Check quyền sở hữu
        if (!order.getUserId().equals(userId)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Bạn không có quyền hủy đơn hàng này");
        }

        // Logic check: Chỉ cho phép hủy nếu đơn chưa thanh toán
        if (order.getStatus() != OrderStatus.PENDING_PAYMENT) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Chỉ có thể hủy đơn hàng đang chờ thanh toán");
        }

        // Đổi trạng thái
        order.setStatus(OrderStatus.CANCELLED);
        orderRepository.save(order);

        // [QUAN TRỌNG] Kích hoạt SAGA: Bắn Kafka báo cho Product-service nhả kho ra (Release)
        var inventoryItems = order.getItems().stream()
                .map(item -> new ReserveInventoryRequest.InventoryItemDto(item.getProductSku(), (long) item.getQuantity()))
                .toList();

        orderEventProducer.publishOrderEvent(order.getId().toString(), "ORDER_CANCELLED", inventoryItems);

        return "Hủy đơn hàng thành công";
    }
}
