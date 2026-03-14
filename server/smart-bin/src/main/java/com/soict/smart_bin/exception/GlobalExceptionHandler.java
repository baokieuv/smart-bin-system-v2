package com.soict.smart_bin.exception;


import com.github.fge.msgsimple.source.MessageSource;
import com.soict.smart_bin.common.ResponseFactory;
import com.soict.smart_bin.dto.core.ApiResponseFormat;
import com.soict.smart_bin.dto.core.FieldErrorDetail;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import java.util.List;
import java.util.Locale;
import java.util.Map;

@Slf4j
@ControllerAdvice
class GlobalExceptionHandler {

    private final ResponseFactory responseFactory;
//    private final MessageSource messageSource;

    public GlobalExceptionHandler(ResponseFactory responseFactory) {
        this.responseFactory = responseFactory;
//        this.messageSource = messageSource;
    }

//    @ExceptionHandler(ApiException.class)
//    public ResponseEntity<ApiResponseFormat<Object>> handleApiException(ApiException ex, Locale locale) {
//        ApiResponseCode errorCode = ex.getErrorCode();
//        log.info("ApiException occurred: code={}, message='{}'", errorCode.getCode(), errorCode.getMessage());
//
//        ApiResponseFormat.ApiData<Object> errorResponse = new ApiResponseFormat.ApiData<>(
//                false,
//                errorCode.getCode(),
//                errorCode.getMessage(),
//                ex.getData() // Include optional data (e.g., validation error details)
//        );
//        return new ResponseEntity<>(responseFactory.response(errorResponse, ex.getMessageArguments()), errorCode.getHttpStatus());
//    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponseFormat<Object>> handleValidationExceptions(MethodArgumentNotValidException ex) {
        CoreErrorCode errorCode = CoreErrorCode.VALIDATION_ERROR;

        // Create a structured list of field errors
        List<FieldErrorDetail> details = ex.getBindingResult()
                .getFieldErrors()
                .stream()
                .map(error -> new FieldErrorDetail(error.getField(), error.getDefaultMessage()))
                .toList();

        log.warn("Validation failed: {}", details);
        ApiResponseFormat.ApiData<Object> errorResponse = new ApiResponseFormat.ApiData<>(false, errorCode.getCode(), errorCode.getMessage(), details);
        return new ResponseEntity<>(responseFactory.response(errorResponse), errorCode.getHttpStatus());
    }


    /**
     * Handles cases where the request body is malformed (e.g., invalid JSON).
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponseFormat<Object>> handleHttpMessageNotReadable(HttpMessageNotReadableException ex) {
        CoreErrorCode errorCode = CoreErrorCode.MALFORMED_REQUEST_BODY;
        log.warn("Malformed request body: {}", ex.getMessage());

        ApiResponseFormat.ApiData<Object> errorResponse = new ApiResponseFormat.ApiData<>(false, errorCode.getCode(), errorCode.getMessage(), null);
        return new ResponseEntity<>(responseFactory.response(errorResponse), errorCode.getHttpStatus());
    }

    /**
     * Handles cases where a required @RequestParam is missing.
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponseFormat<Object>> handleMissingServletRequestParameter(MissingServletRequestParameterException ex) {
        CoreErrorCode errorCode = CoreErrorCode.MISSING_REQUEST_PARAMETER;

        // Provide the name of the missing parameter in the data payload
        Map<String, String> details = Map.of("parameterName", ex.getParameterName());

        log.warn("Missing required parameter: {}", ex.getParameterName());
        ApiResponseFormat.ApiData<Object> errorResponse = new ApiResponseFormat.ApiData<>(false, errorCode.getCode(), errorCode.getMessage(), details);
        return new ResponseEntity<>(responseFactory.response(errorResponse), errorCode.getHttpStatus());
    }


    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponseFormat<Object>> handleGenericException(Exception ex) {
        log.error("An unexpected error occurred: ", ex);
        CoreErrorCode errorCode = CoreErrorCode.INTERNAL_SERVER_ERROR;
        ex.printStackTrace();

        ApiResponseFormat.ApiData<Object> errorResponse = new ApiResponseFormat.ApiData<>(
                false,
                errorCode.getCode(),
                errorCode.getMessage(),
                null
        );

        return new ResponseEntity<>(responseFactory.response(errorResponse), errorCode.getHttpStatus());
    }
}