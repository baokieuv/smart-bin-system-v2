package com.smart_bin.media_service.controller;


import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.media_service.common.SuccessCode;
import org.springframework.core.io.Resource;
import com.smart_bin.media_service.service.StreamService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/stream")
@RequiredArgsConstructor
public class StreamController {
    private final ResponseFactory responseFactory;
    private final StreamService service;

    @PostMapping("/start")
    public ResponseEntity<ApiResponseFormat<Object>> startStream(
            @RequestParam String deviceMac,
            @AuthenticationPrincipal Jwt jwt)
    {
        String userId = jwt.getSubject();
        String tenantId = jwt.getClaimAsString("tenant_id");
        service.startViewingStream(deviceMac, userId, tenantId);
        return responseFactory.response(SuccessCode.OK,"Đã cấp quyền xem HLS và gọi thiết bị");
    }

    @PostMapping("/stop")
    public ResponseEntity<ApiResponseFormat<Object>> stopStream(
            @RequestParam String deviceMac,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String userId = jwt.getSubject();
        String tenantId = jwt.getClaimAsString("tenant_id");
        service.stopViewingStream(deviceMac, userId, tenantId);
        return responseFactory.response(SuccessCode.OK, "Đã dừng xem HLS");
    }

    @PostMapping("/heartbeat")
    public ResponseEntity<ApiResponseFormat<Object>> heartbeat(
            @RequestParam String deviceMac,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String userId = jwt.getSubject();
        service.updateStreamHeartbeat(deviceMac, userId);
        return responseFactory.response(SuccessCode.OK, "Heartbeat OK");
    }

    @GetMapping("/live/{deviceMac}/{fileName}")
    public ResponseEntity<Resource> getLiveStreamFile(
            @PathVariable String deviceMac,
            @PathVariable String fileName)
    {
        try {
            Resource resource = service.getVideoFile(deviceMac, fileName);

            String contentType = fileName.endsWith(".m3u8")
                    ? "application/vnd.apple.mpegurl"
                    : "video/MP2T";

            HttpHeaders headers = new HttpHeaders();
            headers.add(HttpHeaders.CACHE_CONTROL, "no-cache, no-store, must-revalidate");
            headers.add(HttpHeaders.CONTENT_TYPE, contentType);

            return ResponseEntity.ok()
                    .headers(headers)
                    .body(resource);

        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/public/{deviceMac}/upload")
    public ResponseEntity<ApiResponseFormat<Object>> uploadStreamFile(
            @PathVariable String deviceMac,
            @RequestParam("file") MultipartFile file,
            @RequestParam("fileName") String fileName)
    {
        service.saveStreamFile(deviceMac, file, fileName);
        return responseFactory.response(SuccessCode.OK, "Đã lưu file: " + fileName);
    }
}
