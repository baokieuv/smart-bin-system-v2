package com.smart_bin.order_service.service;

import com.smart_bin.order_service.dto.request.CartItemDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CartService {

    private final RedisTemplate<String, Object> redisTemplate;
    private static final String CART_KEY_PREFIX = "cart:";

    // Thêm hoặc Cập nhật sản phẩm vào giỏ
    public void addOrUpdateCartItem(String userId, CartItemDto item) {
        String cartKey = CART_KEY_PREFIX + userId;
        HashOperations<String, String, Integer> hashOps = redisTemplate.opsForHash();

        if (item.quantity() <= 0) {
            // Xóa khỏi giỏ nếu số lượng <= 0
            hashOps.delete(cartKey, item.sku());
            log.info("Removed SKU {} from cart of user {}", item.sku(), userId);
        } else {
            // Đè số lượng mới vào
            hashOps.put(cartKey, item.sku(), item.quantity());
            log.info("Updated cart for user {}: SKU {} -> Qty {}", userId, item.sku(), item.quantity());
        }
    }

    // Lấy toàn bộ giỏ hàng của User
    public List<CartItemDto> getCartItems(String userId) {
        String cartKey = CART_KEY_PREFIX + userId;
        HashOperations<String, String, Integer> hashOps = redisTemplate.opsForHash();

        Map<String, Integer> entries = hashOps.entries(cartKey);

        return entries.entrySet().stream()
                .map(entry -> new CartItemDto(entry.getKey(), entry.getValue()))
                .collect(Collectors.toList());
    }

    // Xóa sạch giỏ hàng (Gọi hàm này sau khi thanh toán thành công)
    public void clearCart(String userId) {
        String cartKey = CART_KEY_PREFIX + userId;
        redisTemplate.delete(cartKey);
        log.info("Cleared cart for user {}", userId);
    }
}