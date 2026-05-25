package com.smart_bin.noti_service.exception;

import com.smart_bin.core.exception.ApiResponseCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum NotiErrorCode implements ApiResponseCode {

    // --- Notification Data Errors ---
    NOTIFICATION_NOT_FOUND(false, "SMB5001", "error.notification_not_found", HttpStatus.NOT_FOUND),
    NOTIFICATION_FORBIDDEN_ACCESS(false, "SMB5002", "error.notification_forbidden_access", HttpStatus.FORBIDDEN),

    // --- System & Integration Errors ---
    EMAIL_SEND_FAILED(false, "SMB5003", "error.email_send_failed", HttpStatus.INTERNAL_SERVER_ERROR),
    KAFKA_EMAIL_CONSUME_FAILED(false, "SMB5004", "error.kafka_email_consume_failed", HttpStatus.INTERNAL_SERVER_ERROR),
    KAFKA_NOTI_CONSUME_FAILED(false, "SMB5005", "error.kafka_noti_consume_failed", HttpStatus.INTERNAL_SERVER_ERROR);

    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}