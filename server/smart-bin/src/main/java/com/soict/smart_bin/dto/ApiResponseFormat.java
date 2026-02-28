package com.soict.smart_bin.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * A standardized, generic wrapper for all API responses.
 *
 * @param data      The response payload.
 * @param timestamp The server timestamp in UTC milliseconds when the response was generated.
 * @param <T>       The type of the data payload.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponseFormat<T>(
        String traceId,
        long timestamp,
        boolean success,
        String code,
        String message,
        T data
) {
    /**
     * Represents structured error information.
     *
     * @param code    A machine-readable error code (e.g., "VALIDATION_ERROR").
     * @param message A human-readable error message.
     * @param details Optional list of specific validation errors or other details.
     */
//    @JsonInclude(JsonInclude.Include.NON_NULL)
//    public record ApiError<E>(
//            String code,
//            String message,
//            E details
//    ) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ApiData<E>(
            boolean success,
            String code,
            String message,
            E details
    ) {}
}