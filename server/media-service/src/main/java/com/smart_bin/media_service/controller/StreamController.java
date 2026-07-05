package com.smart_bin.media_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.media_service.common.SuccessCode;
import com.smart_bin.media_service.service.StreamService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

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

        // Gọi service xử lý RPC và lấy URL Signaling của WebRTC
        String webrtcSignalingUrl = service.startViewingStream(deviceMac, userId, tenantId);

        // Trả URL về cho Client để Client thực hiện kết nối WebRTC
        return responseFactory.response(SuccessCode.OK, webrtcSignalingUrl);
    }

    @PostMapping("/stop")
    public ResponseEntity<ApiResponseFormat<Object>> stopStream(
            @RequestParam String deviceMac,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String userId = jwt.getSubject();
        String tenantId = jwt.getClaimAsString("tenant_id");

        service.stopViewingStream(deviceMac, userId, tenantId);

        return responseFactory.response(SuccessCode.OK, "Đã dừng xem luồng");
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

    @GetMapping("/status")
    public ResponseEntity<ApiResponseFormat<Object>> checkStreamStatus(
            @RequestParam String deviceMac)
    {
        // Web Client gọi định kỳ API này để kiểm tra xem thiết bị đã mở camera thành công chưa
        boolean isReady = service.isDeviceStreamReady(deviceMac);
        return responseFactory.response(SuccessCode.OK, isReady);
    }


    // =========================================================================
    // API DÀNH CHO THIẾT BỊ EDGE (CAMERA/RASPBERRY PI)
    // =========================================================================

    @PostMapping("/ready")
    public ResponseEntity<ApiResponseFormat<Object>> confirmStreamReady(
            @RequestHeader("X-Device-Mac") String deviceMac)
    // Có thể bổ sung @RequestHeader("X-Device-Secret") ở đây để tăng cường bảo mật
    {
        // Thiết bị gọi API này khi tiến trình đẩy luồng (VD: FFmpeg) đã chạy thành công
        service.onDeviceStreamStarted(deviceMac);
        return responseFactory.response(SuccessCode.OK, "Thiết bị báo cáo luồng đã sẵn sàng");
    }
}