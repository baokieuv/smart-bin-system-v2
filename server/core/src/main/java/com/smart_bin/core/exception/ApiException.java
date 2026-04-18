package com.smart_bin.core.exception;

import lombok.Getter;

@Getter
public class ApiException extends RuntimeException {

    private final ApiResponseCode  errorCode;
    private final transient Object data; // 'transient' to exclude from default serialization
    private final transient Object[] messageArguments;

    public ApiException(ApiResponseCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
        this.messageArguments = null;
        this.data = null;
    }

    public ApiException(ApiResponseCode errorCode, Object data) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
        this.messageArguments = null;
        this.data = data;
    }

    public ApiException(ApiResponseCode errorCode, Object data, Object[] messageArguments) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
        this.messageArguments = messageArguments;
        this.data = data;
    }
}
