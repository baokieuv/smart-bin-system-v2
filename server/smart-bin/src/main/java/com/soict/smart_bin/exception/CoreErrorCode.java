package com.soict.smart_bin.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum CoreErrorCode implements ApiResponseCode {
    // --- General & Server Errors ---
    INTERNAL_SERVER_ERROR(false,"AVT0001", "error.other_error", HttpStatus.OK),
    VALIDATION_ERROR(false,"AVT0002", "error.input_validation_failed", HttpStatus.OK),
    MALFORMED_REQUEST_BODY(false,"AVT0003", "error.invalid_input", HttpStatus.OK),
    MISSING_REQUEST_PARAMETER(false,"AVT0004", "error.required_parameter", HttpStatus.OK),
    SERVICE_UNAVAILABLE(false,"AVT0005", "error.service_unavailable", HttpStatus.OK),
    PHONE_NUMBER_INVALID(false,"AVT0006", "error.phone_number_invalid", HttpStatus.OK),
    UNAUTHORIZED(false,"AVT0007", "error.unauthorized", HttpStatus.OK),
    MISMATCHING_TOKEN_SUBJECT(false, "AVT0008", "error.token_subject_mismatch", HttpStatus.OK),
    USER_NOT_LINKED(false, "AVT0009", "error.user_not_linked", HttpStatus.OK)
    ;
    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}