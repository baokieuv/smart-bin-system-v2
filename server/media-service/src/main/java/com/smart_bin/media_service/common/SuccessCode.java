package com.smart_bin.media_service.common;

import com.smart_bin.core.exception.ApiResponseCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum SuccessCode implements ApiResponseCode {
    OK(true, "AVTS0001", "success.ok", HttpStatus.OK),
    CREATED(true, "AVTS0002", "success.created", HttpStatus.CREATED);

    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}
