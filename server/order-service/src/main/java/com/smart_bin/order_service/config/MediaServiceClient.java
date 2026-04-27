package com.smart_bin.order_service.config;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import tools.jackson.databind.JsonNode;

@FeignClient(name = "media-service", url = "${media-service.url:http://localhost:8084}")
public interface MediaServiceClient {

    @PostMapping("/api/v1/media/internal/presigned-upload")
    JsonNode getInternalPresignedUrl(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam("macAddress") String macAddress,
            @RequestParam("fileName") String fileName
    );
}