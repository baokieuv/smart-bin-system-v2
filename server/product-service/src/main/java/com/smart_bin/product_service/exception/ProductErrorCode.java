package com.smart_bin.product_service.exception;

import com.smart_bin.core.exception.ApiResponseCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum ProductErrorCode implements ApiResponseCode {
    PRODUCT_NOT_FOUND(false, "AVT5001", "error.product_not_found", HttpStatus.NOT_FOUND),
    CATEGORY_NOT_FOUND(false, "AVT5002", "error.category_not_found", HttpStatus.NOT_FOUND),
    ;

    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}
