package com.smart_bin.device_service.config;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.JsonNode;

@FeignClient(name = "media-service", url = "${app.media-service.url:http://localhost:2109}")
public interface MediaServiceClient {

    @PostMapping("/api/v1/media/internal/presigned-upload")
    JsonNode getInternalPresignedUrl(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam("macAddress") String macAddress,
            @RequestParam("fileName") String fileName,
            @RequestParam("contentType") String contentType
    );

    @PostMapping(value = "/api/v1/media/internal/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    JsonNode uploadFileInternal(
            @RequestHeader("x-internal-secret") String secret,
            @RequestPart("file") MultipartFile file,
            @RequestParam("extra") String extra,
            @RequestParam(value = "folder", required = false, defaultValue = "") String folder
    );
}