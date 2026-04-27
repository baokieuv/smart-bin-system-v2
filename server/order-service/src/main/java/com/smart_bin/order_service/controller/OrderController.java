package com.smart_bin.order_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.order_service.common.SuccessCode;
import com.smart_bin.order_service.dto.request.CheckoutRequest;
import com.smart_bin.order_service.dto.request.UpdateOrderRequest;
import com.smart_bin.order_service.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
public class OrderController {

    private final ResponseFactory responseFactory;
    private final OrderService orderService;

    @PostMapping("/checkout")
    public ResponseEntity<ApiResponseFormat<Object>> checkout(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CheckoutRequest request
    ) {
        String userId = jwt.getSubject();

        var response = orderService.checkout(userId, request);
        return responseFactory.response(SuccessCode.CREATED, response); // Thường Checkout xong là 201 Created
    }

    // 1. API Lấy danh sách đơn hàng của tôi
    @GetMapping("/my-orders")
    public ResponseEntity<ApiResponseFormat<Object>> getMyOrders(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        String userId = jwt.getSubject();

        var response = orderService.getMyOrders(userId, page, size);
        return responseFactory.response(SuccessCode.OK, response);
    }

    // 2. API Xem chi tiết 1 đơn hàng
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponseFormat<Object>> getOrderDetail(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable("id") String orderId
    ) {
        String userId = jwt.getSubject();

        var response = orderService.getOrderDetail(userId, orderId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    // 3. API Hủy đơn hàng
    @PutMapping("/{id}/cancel")
    public ResponseEntity<ApiResponseFormat<Object>> cancelOrder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable("id") String orderId
    ) {
        String userId = jwt.getSubject();

        var response = orderService.cancelOrder(userId, orderId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    // 4. API Cập nhật đơn hàng (ví dụ: thay đổi địa chỉ)
    @PatchMapping("/{id}")
    public ResponseEntity<ApiResponseFormat<Object>> updateOrder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable("id") String orderId,
            @Valid @RequestBody UpdateOrderRequest request
    ) {
        String userId = jwt.getSubject();

        var response = orderService.updateOrder(userId, orderId, request);
        return responseFactory.response(SuccessCode.OK, response);
    }
}