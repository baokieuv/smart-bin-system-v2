package com.soict.smart_bin.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum CoreErrorCode implements ApiResponseCode {

    // --- General & Server Errors ---
    INTERNAL_SERVER_ERROR(false, "AVT0001", "error.internal_server_error", HttpStatus.INTERNAL_SERVER_ERROR),
    BAD_REQUEST(false, "AVT0002", "error.bad_request", HttpStatus.BAD_REQUEST),
    RESOURCE_NOT_FOUND(false, "AVT0003", "error.resource_not_found", HttpStatus.NOT_FOUND),
    METHOD_NOT_ALLOWED(false, "AVT0004", "error.method_not_allowed", HttpStatus.METHOD_NOT_ALLOWED),

    // --- Input & Validation Errors ---
    VALIDATION_ERROR(false, "AVT0005", "error.input_validation_failed", HttpStatus.BAD_REQUEST),
    MALFORMED_REQUEST_BODY(false, "AVT0006", "error.invalid_input_format", HttpStatus.BAD_REQUEST),
    MISSING_REQUEST_PARAMETER(false, "AVT0007", "error.missing_required_parameter", HttpStatus.BAD_REQUEST),

    // --- File Errors ---
    FILE_IS_NOT_VALID(false, "AVT0008", "error.file_is_not_valid", HttpStatus.BAD_REQUEST),
    FILE_TOO_LARGE(false, "AVT0009", "error.file_too_large", HttpStatus.PAYLOAD_TOO_LARGE),

    // --- External Integrations ---
    EXTERNAL_API_ERROR(false, "AVT0010", "error.external_api_error", HttpStatus.BAD_GATEWAY);

    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}