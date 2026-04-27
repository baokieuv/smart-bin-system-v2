package com.smart_bin.order_service.controller;

import com.smart_bin.order_service.service.PaymentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    // VNPay IPN (Instant Payment Notification)
    @GetMapping("/vnpay_ipn")
    public ResponseEntity<String> vnpayWebhook(
            @RequestParam("vnp_TxnRef") String orderId,
            @RequestParam("vnp_TransactionNo") String transactionId,
            @RequestParam("vnp_ResponseCode") String responseCode) {

        // Response Code "00" nghĩa là thanh toán thành công
        boolean isSuccess = "00".equals(responseCode);

        paymentService.processPaymentWebhook(orderId, transactionId, isSuccess);

        // Webhook VNPay yêu cầu trả về code riêng
        return ResponseEntity.ok("{\"RspCode\":\"00\",\"Message\":\"Confirm Success\"}");
    }
}