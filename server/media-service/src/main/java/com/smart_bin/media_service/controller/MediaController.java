package com.smart_bin.media_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.media_service.common.SuccessCode;
import com.smart_bin.media_service.service.MediaStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/media")
@RequiredArgsConstructor
public class MediaController {

    private final ResponseFactory responseFactory;
    private final MediaStorageService mediaStorageService;

    @Value("${media.internal-secret:SUPER_SECRET_INTERNAL_KEY}")
    private String internalSecret;

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponseFormat<Object>> uploadFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder", required = false) String folder,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String keycloakId = jwt.getSubject();
        var response = mediaStorageService.uploadFile(keycloakId, file, folder);
        return responseFactory.response(SuccessCode.CREATED, response);
    }

    @PostMapping("/presigned-upload")
    public ResponseEntity<ApiResponseFormat<Object>> createPresignedUploadUrl(
            @RequestParam("fileName") String fileName,
            @RequestParam(value = "folder", required = false) String folder,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String keycloakId = jwt.getSubject();
        var response = mediaStorageService.createPresignedUploadUrl(keycloakId, fileName, folder);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/internal/presigned-upload")
    public ResponseEntity<ApiResponseFormat<Object>> createInternalPresignedUrl(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam("macAddress") String macAddress,
            @RequestParam("fileName") String fileName
    ) {
        // 1. Kiểm tra khóa bí mật nội bộ
        if (!internalSecret.equals(secret)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Invalid internal secret key");
        }

        // 2. Cấp URL
        var response = mediaStorageService.createInternalPresignedUploadUrl(macAddress, fileName);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/download-url")
    public ResponseEntity<ApiResponseFormat<Object>> createPresignedDownloadUrl(
            @RequestParam("objectName") String objectName,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String keycloakId = jwt.getSubject();
        var response = mediaStorageService.createPresignedDownloadUrl(keycloakId, objectName);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/files")
    public ResponseEntity<ApiResponseFormat<Object>> listFiles(
            @RequestParam(value = "prefix", required = false) String prefix,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String keycloakId = jwt.getSubject();
        var response = mediaStorageService.listFiles(keycloakId, prefix);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @DeleteMapping("/files")
    public ResponseEntity<ApiResponseFormat<Object>> deleteFile(
            @RequestParam("objectName") String objectName,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String keycloakId = jwt.getSubject();
        mediaStorageService.deleteFile(keycloakId, objectName);
        return responseFactory.response(SuccessCode.OK, "File deleted successfully");
    }
}
