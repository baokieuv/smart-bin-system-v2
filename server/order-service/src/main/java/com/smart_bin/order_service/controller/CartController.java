package com.smart_bin.order_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.order_service.common.SuccessCode;
import com.smart_bin.order_service.dto.request.CartItemDto;
import com.smart_bin.order_service.service.CartService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/cart")
@RequiredArgsConstructor
public class CartController {

    private final ResponseFactory responseFactory;
    private final CartService cartService;

    @GetMapping
    public ResponseEntity<ApiResponseFormat<Object>> getCart(@RequestHeader("X-User-Id") String userId) {
        return responseFactory.response(SuccessCode.OK, cartService.getCartItems(userId));
    }

    @PostMapping
    public ResponseEntity<ApiResponseFormat<Object>> updateCart(
            @RequestHeader("X-User-Id") String userId,
            @Valid @RequestBody CartItemDto item) {
        cartService.addOrUpdateCartItem(userId, item);
        return responseFactory.response(SuccessCode.OK, "Cập nhật giỏ hàng thành công");
    }

    @DeleteMapping
    public ResponseEntity<ApiResponseFormat<Object>> clearCart(@RequestHeader("X-User-Id") String userId) {
        cartService.clearCart(userId);
        return responseFactory.response(SuccessCode.OK, "Đã xóa sạch giỏ hàng");
    }
}