package com.smart_bin.core.exception;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.dto.FieldErrorDetail;
import com.smart_bin.core.utils.ResponseFactory;
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
    private static final String BASE_PACKAGE = "com.soict.smart_bin";

    public GlobalExceptionHandler(ResponseFactory responseFactory) {
        this.responseFactory = responseFactory;
    }

    /**
     * Helper method: Trích xuất và in log chi tiết ra console (không trả về API)
     */
    private void logExceptionDetails(String context, Exception ex) {
        // 1. Tìm Root Cause
        Throwable rootCause = ex;
        while (rootCause.getCause() != null && rootCause.getCause() != rootCause) {
            rootCause = rootCause.getCause();
        }

        // 2. Lọc StackTrace để tìm file/hàm gây lỗi thuộc project
        StackTraceElement errorSource = null;
        for (StackTraceElement element : ex.getStackTrace()) {
            if (element.getClassName().startsWith(BASE_PACKAGE)) {
                errorSource = element;
                break;
            }
        }

        // Nếu không tìm thấy trong package của project, lấy dòng đầu tiên của StackTrace
        if (errorSource == null && ex.getStackTrace().length > 0) {
            errorSource = ex.getStackTrace()[0];
        }

        // 3. Format vị trí lỗi
        String location = errorSource != null
                ? String.format("File: %s | Class: %s | Method: %s | Line: %d",
                errorSource.getFileName(), errorSource.getClassName(), errorSource.getMethodName(), errorSource.getLineNumber())
                : "Unknown location";

        // 4. Print log rành mạch ra console
        log.error("========== ERROR DETAILS ==========");
        log.error("Context    : {}", context);
        log.error("Message    : {}", ex.getMessage());
        log.error("Root Cause : {}", rootCause.toString());
        log.error("Location   : {}", location);
//        log.error("Stack Trace: ", ex);
        log.error("===================================");
    }

    /**
     * Xử lý các lỗi nghiệp vụ (Business Logic) chủ động ném ra từ hệ thống
     */
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiResponseFormat<Object>> handleApiException(ApiException ex, Locale locale) {
        ApiResponseCode errorCode = ex.getErrorCode();

        // Ghi log chi tiết dưới console
        logExceptionDetails(String.format("ApiException occurred: code=%s, message='%s'", errorCode.getCode(), errorCode.getMessage()), ex);

        ApiResponseFormat.ApiData<Object> errorResponse = new ApiResponseFormat.ApiData<>(
                false,
                errorCode.getCode(),
                errorCode.getMessage(),
                ex.getData() // Trả về data đi kèm của lỗi nghiệp vụ (nếu có)
        );
        return new ResponseEntity<>(responseFactory.response(errorResponse, ex.getMessageArguments()), errorCode.getHttpStatus());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponseFormat<Object>> handleValidationExceptions(MethodArgumentNotValidException ex) {
        CoreErrorCode errorCode = CoreErrorCode.VALIDATION_ERROR;

        List<FieldErrorDetail> details = ex.getBindingResult()
                .getFieldErrors()
                .stream()
                .map(error -> new FieldErrorDetail(error.getField(), error.getDefaultMessage()))
                .toList();

        // Ghi log chi tiết
        logExceptionDetails("Validation failed for input parameters", ex);

        ApiResponseFormat.ApiData<Object> errorResponse = new ApiResponseFormat.ApiData<>(false, errorCode.getCode(), errorCode.getMessage(), details);
        return new ResponseEntity<>(responseFactory.response(errorResponse), errorCode.getHttpStatus());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponseFormat<Object>> handleHttpMessageNotReadable(HttpMessageNotReadableException ex) {
        CoreErrorCode errorCode = CoreErrorCode.MALFORMED_REQUEST_BODY;

        // Ghi log chi tiết
        logExceptionDetails("Malformed JSON request body", ex);

        ApiResponseFormat.ApiData<Object> errorResponse = new ApiResponseFormat.ApiData<>(false, errorCode.getCode(), errorCode.getMessage(), null);
        return new ResponseEntity<>(responseFactory.response(errorResponse), errorCode.getHttpStatus());
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponseFormat<Object>> handleMissingServletRequestParameter(MissingServletRequestParameterException ex) {
        CoreErrorCode errorCode = CoreErrorCode.MISSING_REQUEST_PARAMETER;

        Map<String, String> details = Map.of("parameterName", ex.getParameterName());

        // Ghi log chi tiết
        logExceptionDetails("Missing Required Request Parameter: " + ex.getParameterName(), ex);

        ApiResponseFormat.ApiData<Object> errorResponse = new ApiResponseFormat.ApiData<>(false, errorCode.getCode(), errorCode.getMessage(), details);
        return new ResponseEntity<>(responseFactory.response(errorResponse), errorCode.getHttpStatus());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponseFormat<Object>> handleGenericException(Exception ex) {
        CoreErrorCode errorCode = CoreErrorCode.INTERNAL_SERVER_ERROR;

        // Ghi log chi tiết
        logExceptionDetails("Unexpected Internal Server Error", ex);

        // API Response chỉ trả về thông báo chung, data = null
        ApiResponseFormat.ApiData<Object> errorResponse = new ApiResponseFormat.ApiData<>(
                false,
                errorCode.getCode(),
                ex.getMessage(),
                null
        );

        return new ResponseEntity<>(responseFactory.response(errorResponse), errorCode.getHttpStatus());
    }
}