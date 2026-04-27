package com.smart_bin.order_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.order_service.common.SuccessCode;
import com.smart_bin.order_service.dto.request.CartItemDto;
import com.smart_bin.order_service.service.CartService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/cart")
@RequiredArgsConstructor
public class CartController {

    private final ResponseFactory responseFactory;
    private final CartService cartService;

    @GetMapping
    public ResponseEntity<ApiResponseFormat<Object>> getCart(
            @AuthenticationPrincipal Jwt jwt
    ) {
        String userId = jwt.getSubject();
        return responseFactory.response(SuccessCode.OK, cartService.getCartItems(userId));
    }

    @PostMapping
    public ResponseEntity<ApiResponseFormat<Object>> updateCart(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CartItemDto item
    ) {
        String userId = jwt.getSubject();

        cartService.addOrUpdateCartItem(userId, item);
        return responseFactory.response(SuccessCode.OK, "Cập nhật giỏ hàng thành công");
    }

    @DeleteMapping
    public ResponseEntity<ApiResponseFormat<Object>> clearCart(
            @AuthenticationPrincipal Jwt jwt
    ) {
        String userId = jwt.getSubject();

        cartService.clearCart(userId);
        return responseFactory.response(SuccessCode.OK, "Đã xóa sạch giỏ hàng");
    }
}