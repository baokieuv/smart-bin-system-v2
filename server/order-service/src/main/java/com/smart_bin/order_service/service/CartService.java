package com.smart_bin.order_service.service;

import com.smart_bin.order_service.dto.request.CartItemDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CartService {

    private final RedisTemplate<String, Object> redisTemplate;
    private static final String CART_KEY_PREFIX = "cart:";

    private static final long CART_TTL_DAYS = 7;

    // Thêm hoặc Cập nhật sản phẩm vào giỏ
    public void addOrUpdateCartItem(String userId, CartItemDto item) {
        String cartKey = buildCartKey(userId);
        HashOperations<String, String, Object> hashOps = redisTemplate.opsForHash();

        if (item.quantity() <= 0) {
            hashOps.delete(cartKey, item.sku());
            log.info("Removed SKU {} from cart of user {}", item.sku(), userId);
        } else {
            hashOps.put(cartKey, item.sku(), item.quantity());
            log.info("Updated cart for user {}: SKU {} -> Qty {}", userId, item.sku(), item.quantity());
        }

        // Reset TTL sau mỗi tương tác để tránh expire giữa chừng khi user đang shopping
        resetTtl(cartKey);
    }

    // Lấy toàn bộ giỏ hàng của User
    public List<CartItemDto> getCartItems(String userId) {
        String cartKey = buildCartKey(userId);
        HashOperations<String, String, Object> hashOps = redisTemplate.opsForHash();

        Map<String, Object> entries = hashOps.entries(cartKey);

        return entries.entrySet().stream()
                .filter(e -> e.getValue() != null)
                .map(e -> {
                    int quantity = ((Number) e.getValue()).intValue();
                    return new CartItemDto(e.getKey(), quantity);
                })
                .collect(Collectors.toList());
    }

    // Xóa sạch giỏ hàng (Gọi hàm này sau khi thanh toán thành công)
    public void clearCart(String userId) {
        String cartKey = buildCartKey(userId);
        redisTemplate.delete(cartKey);
        log.info("Cleared cart for user {}", userId);
    }

    public boolean isCartEmpty(String userId) {
        String cartKey = buildCartKey(userId);
        HashOperations<String, String, Object> hashOps = redisTemplate.opsForHash();
        Long size = hashOps.size(cartKey);
        return size == null || size == 0;
    }

    private String buildCartKey(String userId) {
        return CART_KEY_PREFIX + userId;
    }

    private void resetTtl(String cartKey) {
        redisTemplate.expire(cartKey, CART_TTL_DAYS, TimeUnit.DAYS);
    }
}