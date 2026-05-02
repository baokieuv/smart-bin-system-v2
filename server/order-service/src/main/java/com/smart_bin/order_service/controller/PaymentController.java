package com.smart_bin.order_service.controller;

import com.smart_bin.order_service.service.PaymentService;
import jakarta.servlet.http.HttpServletRequest;
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
    public ResponseEntity<Object> vnpayWebhook(HttpServletRequest request) {
        var response = paymentService.processVnpayIpn(request);

        return ResponseEntity.ok(response);
    }

    @GetMapping("/vnpay_return")
    public ResponseEntity<Object> vnpayReturn(HttpServletRequest request) {
        var result = paymentService.processVnpayReturn(request);

        return ResponseEntity.ok(result);
    }
}