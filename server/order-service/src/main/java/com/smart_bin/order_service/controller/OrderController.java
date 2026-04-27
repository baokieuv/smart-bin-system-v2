package com.smart_bin.order_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.order_service.common.SuccessCode;
import com.smart_bin.order_service.dto.request.CheckoutRequest;
import com.smart_bin.order_service.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
public class OrderController {

    private final ResponseFactory responseFactory;
    private final OrderService orderService;

    @PostMapping("/checkout")
    public ResponseEntity<ApiResponseFormat<Object>> checkout(
            @RequestHeader("X-User-Id") String userId,
            @Valid @RequestBody CheckoutRequest request) {

        var response = orderService.checkout(userId, request);
        return responseFactory.response(SuccessCode.CREATED, response); // Thường Checkout xong là 201 Created
    }

    // [MỚI] 1. API Lấy danh sách đơn hàng của tôi
    @GetMapping("/my-orders")
    public ResponseEntity<ApiResponseFormat<Object>> getMyOrders(
            @RequestHeader("X-User-Id") String userId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {

        var response = orderService.getMyOrders(userId, page, size);
        return responseFactory.response(SuccessCode.OK, response);
    }

    // [MỚI] 2. API Xem chi tiết 1 đơn hàng
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponseFormat<Object>> getOrderDetail(
            @RequestHeader("X-User-Id") String userId,
            @PathVariable("id") String orderId) {

        var response = orderService.getOrderDetail(userId, orderId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    // [MỚI] 3. API Hủy đơn hàng
    @PutMapping("/{id}/cancel")
    public ResponseEntity<ApiResponseFormat<Object>> cancelOrder(
            @RequestHeader("X-User-Id") String userId,
            @PathVariable("id") String orderId) {

        var response = orderService.cancelOrder(userId, orderId);
        return responseFactory.response(SuccessCode.OK, response);
    }
}