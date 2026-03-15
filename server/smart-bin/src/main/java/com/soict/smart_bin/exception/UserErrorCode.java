package com.soict.smart_bin.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum UserErrorCode implements ApiResponseCode {

    USER_NOT_FOUND(false, "AVT1001", "error.user_not_found", HttpStatus.NOT_FOUND),
    USER_ALREADY_EXISTED(false, "AVT1002", "error.user_already_existed", HttpStatus.CONFLICT),
    EMAIL_ALREADY_IN_USE(false, "AVT1003", "error.email_already_in_use", HttpStatus.CONFLICT),
    PHONE_ALREADY_IN_USE(false, "AVT1004", "error.phone_already_in_use", HttpStatus.CONFLICT),
    USER_INACTIVE(false, "AVT1005", "error.user_inactive", HttpStatus.FORBIDDEN),
    USER_BLOCKED(false, "AVT1006", "error.user_blocked", HttpStatus.FORBIDDEN),
    INVALID_PASSWORD(false, "AVT1007", "error.invalid_password", HttpStatus.BAD_REQUEST);

    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}