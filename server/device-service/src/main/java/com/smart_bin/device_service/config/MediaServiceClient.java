package com.smart_bin.device_service.config;

import com.smart_bin.core.dto.ApiResponseFormat;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.JsonNode;

@FeignClient(name = "media-service", url = "${media-service.url:http://localhost:2109}")
public interface MediaServiceClient {

    @PostMapping("/api/v1/media/internal/presigned-upload")
    JsonNode getInternalPresignedUrl(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam("macAddress") String macAddress,
            @RequestParam("fileName") String fileName,
            @RequestParam("contentType") String contentType
    );

    @PostMapping("/internal/upload")
    JsonNode uploadFileInternal(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam("file") MultipartFile file,
            @RequestParam("extra") String extra,
            @RequestParam(value = "folder", required = false, defaultValue = "") String folder
    );
}