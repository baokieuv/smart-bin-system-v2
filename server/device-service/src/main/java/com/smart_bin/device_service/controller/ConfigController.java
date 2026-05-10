package com.smart_bin.device_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.device_service.common.SuccessCode;
import com.smart_bin.device_service.dto.request.*;
import com.smart_bin.device_service.service.ConfigService;
import com.smart_bin.device_service.utils.HardwareSecureResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/configs")
@RequiredArgsConstructor
public class ConfigController {

    private final ConfigService configService;
    private final ResponseFactory responseFactory;

    // ==========================================
    // 1. ADMIN APIs (Quản lý Firmware)
    // ==========================================

    @PostMapping("/firmwares")
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> uploadFirmware(
            @RequestParam("file") MultipartFile file,
            @RequestParam("version") String version,
            @RequestParam("type") String type,
            @RequestParam(value = "description", required = false) String description
    ) {
        var response = configService.uploadFirmware(file, version, type, description);
        return responseFactory.response(SuccessCode.CREATED, response);
    }

    @GetMapping("/firmwares")
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getFirmwares(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        var response = configService.getFirmwares(page, size);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @DeleteMapping("/firmwares/{id}")
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> deleteFirmware(@PathVariable java.util.UUID id) {
        configService.deleteFirmware(id);
        return responseFactory.response(SuccessCode.OK, "Đã xóa mềm firmware");
    }

    // ==========================================
    // 2. CONFIG APIs (Web App: Admin & Owner)
    // ==========================================

    @GetMapping("/devices/{deviceId}")
    public ResponseEntity<ApiResponseFormat<Object>> getConfigForWeb(@PathVariable String deviceId) {
        var response = configService.getConfig(deviceId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/devices/{deviceId}/owner")
    public ResponseEntity<ApiResponseFormat<Object>> updateOwnerConfig(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String deviceId,
            @Valid @RequestBody UpdateOwnerConfigRequest request
    ) {
        String keycloakId = jwt.getSubject();
        var response = configService.updateOwnerConfig(deviceId, keycloakId, request);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/devices/{deviceId}/admin")
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> updateAdminConfig(
            @PathVariable String deviceId,
            @RequestBody UpdateAdminConfigRequest request
    ) {
        var response = configService.updateAdminConfig(deviceId, request);
        return responseFactory.response(SuccessCode.OK, response);
    }

    // ==========================================
    // 3. DEVICE APIs (Thùng rác gọi bằng Hardware Security)
    // ==========================================

    @PostMapping("/public/devices/config")
    @HardwareSecureResponse
    public ResponseEntity<ApiResponseFormat<Object>> getConfigForDevice(
            @RequestBody String payload,
            @RequestHeader("X-Signature") String signature
    ) {
        var response = configService.getConfigForDevice(payload, signature);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/public/ota/check")
    @HardwareSecureResponse
    public ResponseEntity<ApiResponseFormat<Object>> checkOta(
            @RequestBody String payload,
            @RequestHeader("X-Signature") String signature
    ) {
        var response = configService.checkOta(payload, signature);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/public/ota/status")
    @HardwareSecureResponse
    public ResponseEntity<ApiResponseFormat<Object>> reportOtaStatus(
            @RequestBody String payload,
            @RequestHeader("X-Signature") String signature
    ) {
        configService.reportOtaStatus(payload, signature);
        return responseFactory.response(SuccessCode.OK, "Đã ghi nhận trạng thái OTA");
    }
}