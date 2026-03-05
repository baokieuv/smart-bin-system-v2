package com.soict.smart_bin.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum CoreErrorCode implements ApiResponseCode {
    // --- General & Server Errors ---
    INTERNAL_SERVER_ERROR(false,"AVT0001", "error.other_error", HttpStatus.INTERNAL_SERVER_ERROR),
    USER_NOT_FOUND(false, "AVT0002", "error.user_not_found", HttpStatus.NOT_FOUND),
    FILE_IS_NOT_VALID(false, "AVT0003", "error.file_is_not_valid", HttpStatus.BAD_REQUEST),
    FILE_TOO_LARGE(false, "AVT0004", "error.file_too_large", HttpStatus.BAD_REQUEST),
    USER_ALREADY_EXISTED(false, "AVT0005", "error.user_already_existed", HttpStatus.CONFLICT),
    INVALID_TOKEN(false, "AVT0006", "error.invalid_token", HttpStatus.BAD_REQUEST),
    VALIDATION_ERROR(false,"AVT0007", "error.input_validation_failed", HttpStatus.OK),
    MALFORMED_REQUEST_BODY(false,"AVT0008", "error.invalid_input", HttpStatus.OK),
    MISSING_REQUEST_PARAMETER(false,"AVT0009", "error.required_parameter", HttpStatus.OK),
    BAD_REQUEST(false, "AVT0010", "error.bad_request", HttpStatus.BAD_REQUEST)
    ;
    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}