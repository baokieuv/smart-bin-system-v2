package com.smart_bin.order_service.service;

import com.smart_bin.core.common.OrderType;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.order_service.common.OrderStatus;
import com.smart_bin.order_service.dto.request.ReserveInventoryRequest;
import com.smart_bin.order_service.repository.OrderRepository;
import com.smart_bin.order_service.utils.VNPayUtil;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import com.smart_bin.order_service.entity.Order;
import org.springframework.transaction.annotation.Transactional;

import java.io.UnsupportedEncodingException;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final OrderRepository orderRepository;
    private final OrderEventProducer orderEventProducer;
    private final CartService cartService;


    @Value("${vnpay.tmn-code}")
    private String vnp_TmnCode;

    @Value("${vnpay.hash-secret}")
    private String secretKey;

    @Value("${vnpay.url}")
    private String vnp_PayUrl;

    @Value("${vnpay.return-url}")
    private String vnp_ReturnUrl;

    @Value("${vnpay.version}")
    private String vnp_Version;

    @Value("${vnpay.command}")
    private String vnp_Command;


    public String generatePaymentUrl(Order order, String ipAddress) throws UnsupportedEncodingException {
        if ("COD".equalsIgnoreCase(order.getPaymentMethod())) {
            return null;
        }

        String vnp_TxnRef = order.getId().toString();

        Map<String, String> vnp_params = new HashMap<>();
        vnp_params.put("vnp_Version", vnp_Version);
        vnp_params.put("vnp_Command", vnp_Command);
        vnp_params.put("vnp_TmnCode", vnp_TmnCode);
        // VNPay yêu cầu amount * 100 (đơn vị: đồng -> xu)
        vnp_params.put("vnp_Amount", String.valueOf(order.getTotalAmount().multiply(BigDecimal.valueOf(100)).longValue()));
        vnp_params.put("vnp_CurrCode", "VND");
        vnp_params.put("vnp_TxnRef", vnp_TxnRef);
        vnp_params.put("vnp_OrderInfo", "Thanh toan don hang: " + vnp_TxnRef);
        vnp_params.put("vnp_OrderType", "other");
        vnp_params.put("vnp_Locale", "vn");
        vnp_params.put("vnp_ReturnUrl", vnp_ReturnUrl);
        vnp_params.put("vnp_IpAddr", ipAddress != null ? ipAddress : "127.0.0.1");

        Calendar cld = Calendar.getInstance(TimeZone.getTimeZone("Etc/GMT+7"));
        SimpleDateFormat formatter = new SimpleDateFormat("yyyyMMddHHmmss");
        String vnp_CreateDate = formatter.format(cld.getTime());
        vnp_params.put("vnp_CreateDate", vnp_CreateDate);

        cld.add(Calendar.MINUTE, 15);
        String vnp_ExpireDate = formatter.format(cld.getTime());
        vnp_params.put("vnp_ExpireDate", vnp_ExpireDate);

        List<String> fieldNames = new ArrayList<>(vnp_params.keySet());
        Collections.sort(fieldNames);

        StringBuilder hashData = new StringBuilder();
        StringBuilder query = new StringBuilder();

        for (int i = 0; i < fieldNames.size(); i++) {
            String fieldName = fieldNames.get(i);
            String fieldValue = vnp_params.get(fieldName);
            if (fieldValue != null && !fieldValue.isEmpty()) {
                String encodedName  = URLEncoder.encode(fieldName, StandardCharsets.US_ASCII);
                String encodedValue = URLEncoder.encode(fieldValue, StandardCharsets.US_ASCII);

                hashData.append(encodedName).append('=').append(encodedValue);
                query.append(encodedName).append('=').append(encodedValue);

                if (i < fieldNames.size() - 1) {
                    hashData.append('&');
                    query.append('&');
                }
            }
        }

        // Tạo Secure Hash
        String vnp_SecureHash = VNPayUtil.hmacSHA512(secretKey, hashData.toString());
        String queryUrl = query + "&vnp_SecureHash=" + vnp_SecureHash;

        return vnp_PayUrl + "?" + queryUrl;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, String> processVnpayIpn(HttpServletRequest request) {
        Map<String, String> fields = extractParams(request);

        String vnp_SecureHash = request.getParameter("vnp_SecureHash");
        fields.remove("vnp_SecureHashType");
        fields.remove("vnp_SecureHash");

        // 1. Kiểm tra chữ ký
        String signValue = VNPayUtil.hmacSHA512(secretKey, hashAllFields(fields));
        if (!signValue.equals(vnp_SecureHash)) {
            log.warn("VNPay IPN: Invalid checksum for request params: {}", fields);
            return Map.of("RspCode", "97", "Message", "Invalid Checksum");
        }

        String orderIdStr   = request.getParameter("vnp_TxnRef");
        String vnp_Amount   = request.getParameter("vnp_Amount");
        String responseCode = request.getParameter("vnp_ResponseCode");
        String transactionId = request.getParameter("vnp_TransactionNo");

        // 2. Tìm đơn hàng
        UUID orderId;
        try {
            orderId = UUID.fromString(orderIdStr);
        } catch (IllegalArgumentException e) {
            return Map.of("RspCode", "01", "Message", "Invalid order ID format");
        }

        Optional<Order> orderOpt = orderRepository.findByIdWithLock(orderId);
        if (orderOpt.isEmpty()) {
            log.warn("VNPay IPN: Order not found for ID: {}", orderIdStr);
            return Map.of("RspCode", "01", "Message", "Order not found");
        }
        Order order = orderOpt.get();

        // 3. Kiểm tra trạng thái đơn hàng
        if (order.getStatus() != OrderStatus.PENDING_PAYMENT) {
            log.info("VNPay IPN: Order {} already processed with status {}", orderIdStr, order.getStatus());
            return Map.of("RspCode", "02", "Message", "Order already confirmed");
        }

        // 4. Kiểm tra số tiền
        BigDecimal expectedAmount = order.getTotalAmount().multiply(BigDecimal.valueOf(100));
        BigDecimal receivedAmount = new BigDecimal(vnp_Amount);
        if (expectedAmount.compareTo(receivedAmount) != 0) {
            log.warn("VNPay IPN: Amount mismatch for order {}. Expected: {}, Received: {}",
                    orderIdStr, expectedAmount, receivedAmount);
            return Map.of("RspCode", "04", "Message", "Invalid amount");
        }

        // 5. Cập nhật Database & Publish Event
        boolean isSuccess = "00".equals(responseCode);
        order.setPaymentTransactionId(transactionId);

        List<ReserveInventoryRequest.InventoryItemDto> inventoryItems = order.getItems().stream()
                .map(item -> new ReserveInventoryRequest.InventoryItemDto(
                        item.getProductSku(), (long) item.getQuantity()))
                .collect(Collectors.toList());

        if (isSuccess) {
            order.setStatus(OrderStatus.PAID);
            orderRepository.save(order);
            orderEventProducer.publishOrderEvent(orderIdStr, OrderType.ORDER_PAID, inventoryItems);
            safelyClearCart(order.getUserId(), orderIdStr);

            log.info("Order {} payment confirmed successfully. TxnId: {}", orderIdStr, transactionId);
        } else {
            order.setStatus(OrderStatus.FAILED);
            orderRepository.save(order);
            orderEventProducer.publishOrderEvent(orderIdStr, OrderType.ORDER_CANCELLED, inventoryItems);

            log.info("Order {} payment failed. ResponseCode: {}", orderIdStr, responseCode);
        }

        // 6. Trả về thành công
        return Map.of("RspCode", "00", "Message", "Confirm Success");

    }

    // Hàm xử lý Return URL
    public Map<String, String> processVnpayReturn(HttpServletRequest request) {
        Map<String, String> fields = extractParams(request);

        String vnp_SecureHash = request.getParameter("vnp_SecureHash");
        fields.remove("vnp_SecureHashType");
        fields.remove("vnp_SecureHash");

        String signValue = VNPayUtil.hmacSHA512(secretKey, hashAllFields(fields));
        if (!signValue.equals(vnp_SecureHash)) {
            return Map.of("status", "error", "message", "Tham số không hợp lệ (Invalid Checksum)");
        }

        String responseCode = request.getParameter("vnp_ResponseCode");
        if ("00".equals(responseCode)) {
            return Map.of("status", "success", "message", "Thanh toán thành công");
        } else {
            return Map.of("status", "failed", "message", "Thanh toán thất bại hoặc đã bị hủy");
        }
    }


    // Hàm hỗ trợ sort và build string để tạo Hash
    private String hashAllFields(Map<String, String> fields) {
        List<String> fieldNames = new ArrayList<>(fields.keySet());
        Collections.sort(fieldNames);

        List<String> parts = new ArrayList<>();
        for (String fieldName : fieldNames) {
            String fieldValue = fields.get(fieldName);
            if (fieldValue != null && !fieldValue.isEmpty()) {
                parts.add(fieldName + "=" + URLEncoder.encode(fieldValue, StandardCharsets.US_ASCII));
            }
        }
        return String.join("&", parts);
    }

    private Map<String, String> extractParams(HttpServletRequest request) {
        Map<String, String> fields = new HashMap<>();
        for (Enumeration<String> params = request.getParameterNames(); params.hasMoreElements(); ) {
            String fieldName  = params.nextElement();
            String fieldValue = request.getParameter(fieldName);
            if (fieldValue != null && !fieldValue.isEmpty()) {
                fields.put(fieldName, fieldValue);
            }
        }
        return fields;
    }

    private void safelyClearCart(String userId, String orderId) {
        try {
            cartService.clearCart(userId);
        } catch (Exception e) {
            log.error("Failed to clear cart for user {} after order {} paid. " +
                    "Cart will expire by TTL. Error: {}", userId, orderId, e.getMessage());
        }
    }
}
