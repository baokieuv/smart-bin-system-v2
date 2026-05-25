package com.smart_bin.iam_service.exception;

import com.smart_bin.core.exception.ApiResponseCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum UserErrorCode implements ApiResponseCode {

    USER_NOT_FOUND(false, "SMB1001", "error.user_not_found", HttpStatus.NOT_FOUND),
    USER_ALREADY_EXISTED(false, "SMB1002", "error.user_already_existed", HttpStatus.CONFLICT),
    EMAIL_ALREADY_IN_USE(false, "SMB1003", "error.email_already_in_use", HttpStatus.CONFLICT),
    PHONE_ALREADY_IN_USE(false, "SMB1004", "error.phone_already_in_use", HttpStatus.CONFLICT),
    USER_INACTIVE(false, "SMB1005", "error.user_inactive", HttpStatus.FORBIDDEN),
    USER_BLOCKED(false, "SMB1006", "error.user_blocked", HttpStatus.FORBIDDEN),
    INVALID_PASSWORD(false, "SMB1007", "error.invalid_password", HttpStatus.BAD_REQUEST),

    // --- CÁC MÃ LỖI MỚI BỔ SUNG ---
    TENANT_NOT_FOUND(false, "SMB1008", "error.tenant_not_found", HttpStatus.NOT_FOUND),
    INVALID_TENANT(false, "SMB1009", "error.invalid_tenant", HttpStatus.FORBIDDEN),
    USER_ALREADY_MAPPED_TO_TENANT(false, "SMB1010", "error.user_already_mapped_to_tenant", HttpStatus.CONFLICT),
    INVALID_AVATAR_URL(false, "SMB1011", "error.invalid_avatar_url", HttpStatus.BAD_REQUEST);

    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}