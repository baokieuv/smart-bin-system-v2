package com.smart_bin.media_service.exception;

import com.smart_bin.core.exception.ApiResponseCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum MediaErrorCode implements ApiResponseCode {

    // --- File Storage Errors ---
    UPLOAD_FAILED(false, "SMB4001", "error.upload_failed", HttpStatus.INTERNAL_SERVER_ERROR),
    GENERATE_PRESIGNED_URL_FAILED(false, "SMB4002", "error.generate_presigned_url_failed", HttpStatus.INTERNAL_SERVER_ERROR),
    LIST_FILES_FAILED(false, "SMB4003", "error.list_files_failed", HttpStatus.INTERNAL_SERVER_ERROR),
    DELETE_FILE_FAILED(false, "SMB4004", "error.delete_file_failed", HttpStatus.INTERNAL_SERVER_ERROR),

    // --- Validation & Security Errors ---
    UNSUPPORTED_FILE_TYPE(false, "SMB4005", "error.unsupported_file_type", HttpStatus.BAD_REQUEST),
    MISSING_CONTENT_TYPE(false, "SMB4006", "error.missing_content_type", HttpStatus.BAD_REQUEST),
    MISSING_REQUIRED_DEVICE_PARAMS(false, "SMB4007", "error.missing_required_device_params", HttpStatus.BAD_REQUEST),
    INVALID_FILE_NAME(false, "SMB4008", "error.invalid_file_name", HttpStatus.BAD_REQUEST),
    PATH_TRAVERSAL_DETECTED(false, "SMB4009", "error.path_traversal_detected", HttpStatus.BAD_REQUEST),
    MISSING_OBJECT_NAME(false, "SMB4010", "error.missing_object_name", HttpStatus.BAD_REQUEST);


    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}