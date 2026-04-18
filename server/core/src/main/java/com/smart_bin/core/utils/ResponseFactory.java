package com.smart_bin.core.utils;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.exception.ApiResponseCode;
import io.micrometer.tracing.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Optional;

@Component
@SuppressWarnings("rawtypes")
@Slf4j
public class ResponseFactory {

    private final Tracer tracer;
    private final MessageSource messageSource;

    // Inject the Tracer via the constructor
    public ResponseFactory(Tracer tracer, MessageSource messageSource) {
        this.tracer = tracer;
        this.messageSource = messageSource;
    }

    public <T> ResponseEntity<ApiResponseFormat<Object>> response(ApiResponseCode responseCode, T data) {
        // Get the current request's locale
        Locale locale = LocaleContextHolder.getLocale();

        // Resolve the message key to get the localized message
        String localizedMessage = messageSource.getMessage(
                responseCode.getMessage(), // e.g., "success.user.exists"
                null,
                locale
        );
        ApiResponseFormat.ApiData<T> apiData = new ApiResponseFormat.ApiData<>(
                responseCode.isSuccess(),
                responseCode.getCode(),
                localizedMessage,
                data
        );
        // Create the final response body
        ApiResponseFormat<Object> body = new ApiResponseFormat<>(
                getCurrentTraceId(),
                System.currentTimeMillis(),
                apiData.success(),
                apiData.code(),
                apiData.message(),
                apiData.details()
        );

        // Return the full ResponseEntity with the correct status code
        return new ResponseEntity<>(body, responseCode.getHttpStatus());
    }

    public ApiResponseFormat<Object> response(ApiResponseFormat.ApiData data) {
        Locale locale = LocaleContextHolder.getLocale();
        String resolvedMessage = this.messageSource.getMessage(
                data.message(),
                null,
                data.message(), // <-- Default message if code not found
                locale
        );

        return new ApiResponseFormat<>(
                getCurrentTraceId(),
                System.currentTimeMillis(),
                data.success(),
                data.code(),
                resolvedMessage,
                data.details()
        );
    }

    public ApiResponseFormat<Object> response(ApiResponseFormat.ApiData data, Object[] details) {
        Locale locale = LocaleContextHolder.getLocale();
        String resolvedMessage = this.messageSource.getMessage(
                data.message(),
                details,
                data.message(), // <-- Default message if code not found
                locale
        );
        log.info("Response message: {}", resolvedMessage);
        return new ApiResponseFormat<>(
                getCurrentTraceId(),
                System.currentTimeMillis(),
                data.success(),
                data.code(),
                resolvedMessage,
                data.details()
        );
    }

    /**
     * Retrieves the current traceId from the active Span.
     * Returns null if no active trace exists.
     */
    private String getCurrentTraceId() {
        return Optional.ofNullable(tracer.currentSpan())
                .map(Span::context)
                .map(TraceContext::traceId)
                .orElse(null);
    }
}
