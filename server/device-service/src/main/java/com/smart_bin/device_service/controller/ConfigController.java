package com.smart_bin.device_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.device_service.common.SuccessCode;
import com.smart_bin.device_service.dto.request.UpdateFirmwareRequest;
import com.smart_bin.device_service.service.ConfigService;
import com.smart_bin.device_service.utils.HardwareSecureResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/configs")
@RequiredArgsConstructor
public class ConfigController {

    private final ConfigService configService;
    private final ResponseFactory responseFactory;

    @PostMapping("/firmwares")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
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
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getFirmwares(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        var response = configService.getFirmwares(page, size);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @DeleteMapping("/firmwares/{id}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> deleteFirmware(@PathVariable java.util.UUID id) {
        configService.deleteFirmware(id);
        return responseFactory.response(SuccessCode.OK, "Đã xóa mềm firmware");
    }

    @GetMapping("/devices/{deviceId}")
    public ResponseEntity<ApiResponseFormat<Object>> getConfigForWeb(@PathVariable String deviceId) {
        var response = configService.getConfig(deviceId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/devices/{deviceId}/firmware")
    public ResponseEntity<ApiResponseFormat<Object>> updateDeviceFirmware(
            @PathVariable String deviceId,
            @Valid @RequestBody UpdateFirmwareRequest request
    ) {
        var response = configService.updateDeviceFirmware(deviceId, request);
        return responseFactory.response(SuccessCode.OK, response);
    }

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