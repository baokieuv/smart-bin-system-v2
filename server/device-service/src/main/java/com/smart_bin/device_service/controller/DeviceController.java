package com.smart_bin.device_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.device_service.common.SuccessCode;
import com.smart_bin.device_service.dto.request.AppVersionInfo;
import com.smart_bin.device_service.dto.request.CreateDeviceRequest;
import com.smart_bin.device_service.dto.request.ImportDeviceRequest;
import com.smart_bin.device_service.dto.request.UpdateDeviceRequest;
import com.smart_bin.device_service.service.DeviceService;
import com.smart_bin.device_service.utils.HardwareSecureResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceController {

    private final ResponseFactory responseFactory;
    private final DeviceService deviceService;

    @PostMapping("/import")
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> importDevices(
            @Valid @RequestBody ImportDeviceRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String actorId = jwt.getSubject();
        var response = deviceService.importDevices(request, actorId);
        return responseFactory.response(SuccessCode.CREATED, response);
    }

    @PostMapping
    public ResponseEntity<ApiResponseFormat<Object>> addDevice(
            @Valid @RequestBody CreateDeviceRequest request,
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();
        var response = deviceService.addDevice(request, keycloakId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping
    public ResponseEntity<ApiResponseFormat<Object>> getListDevices(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false, defaultValue = "1") int page,
            @RequestParam(required = false, defaultValue = "10") int size
    ){
        String keycloakId = jwt.getSubject();
        var response = deviceService.getListDevices(keycloakId, page, size);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/admin")
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getAllDevicesForAdmin(
            @RequestParam(required = false, defaultValue = "1") int page,
            @RequestParam(required = false, defaultValue = "10") int size
    ){
        var response = deviceService.getAllDevicesForAdmin(page, size);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/{deviceId}")
    public ResponseEntity<ApiResponseFormat<Object>> getDeviceDetail(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String deviceId
    ){
        String keycloakId = jwt.getSubject();
        var response = deviceService.getDeviceDetail(keycloakId, deviceId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/{deviceId}")
    public ResponseEntity<ApiResponseFormat<Object>> updateDevice(
            @Valid @RequestBody UpdateDeviceRequest request,
            @PathVariable String deviceId,
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();
        var response = deviceService.updateDevice(deviceId, request, keycloakId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @DeleteMapping("/{deviceId}")
    public ResponseEntity<ApiResponseFormat<Object>> deleteDevice(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String deviceId
    ){
        String keycloakId = jwt.getSubject();
        deviceService.deleteDevice(deviceId, keycloakId);
        return responseFactory.response(SuccessCode.OK, "Deleted device successfully!");
    }

    @GetMapping("/{deviceId}/telemetries")
    public ResponseEntity<ApiResponseFormat<Object>> getTelemetries(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String deviceId,
            @RequestParam(required = false) String keys,
            @RequestParam(required = false) Long startTs,
            @RequestParam(required = false) Long endTs
    ){
        String keycloakId = jwt.getSubject();
        var response = deviceService.getTelemetries(deviceId, keycloakId, keys, startTs, endTs);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/{deviceId}/attributes")
    public ResponseEntity<ApiResponseFormat<Object>> getAttributes(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String deviceId,
            @RequestParam(required = false, defaultValue = "") String keys
    ){
        String keycloakId = jwt.getSubject();
        var response = deviceService.getAttributes(deviceId, keycloakId, keys);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/public/presigned-url")
    @HardwareSecureResponse
    public ResponseEntity<ApiResponseFormat<Object>> getPresignedUrl(
            @RequestHeader("X-Signature") String signature,
            @RequestHeader("metadata") String metadata,
            @RequestBody String payload,
            @RequestHeader(value = "X-Desktop-Version", required = false) String desktopVer,
            @RequestHeader(value = "X-Bin-Version", required = false) String binVer
    ) {
        var response = deviceService.getPresignedUrl(payload, signature, metadata, desktopVer, binVer);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping(value = "/public/confirm-upload")
    @HardwareSecureResponse
    public ResponseEntity<ApiResponseFormat<Object>> confirmUpload(
            @RequestHeader("metadata") String metadata,
            @RequestBody String payload,
            @RequestHeader("X-Signature") String signature,
            @RequestHeader(value = "X-Desktop-Version", required = false) String desktopVer,
            @RequestHeader(value = "X-Bin-Version", required = false) String binVer
    ){
        var response = deviceService.confirmUpload(payload, signature, metadata, desktopVer, binVer);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/public/activate")
    public ResponseEntity<ApiResponseFormat<Object>> activateDevice(
            @RequestBody String payload,
            @RequestHeader(value = "X-Desktop-Version", required = false) String desktopVer,
            @RequestHeader(value = "X-Bin-Version", required = false) String binVer
    ){
        var response = deviceService.activateDevice(payload, desktopVer, binVer);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/public/get-access-token")
    @HardwareSecureResponse
    public ResponseEntity<ApiResponseFormat<Object>> getAccessToken(
            @RequestBody String payload,
            @RequestHeader("X-Signature") String signature,
            @RequestHeader(value = "X-Desktop-Version", required = false) String desktopVer,
            @RequestHeader(value = "X-Bin-Version", required = false) String binVer
    ){
        var response = deviceService.getAccessToken(payload, signature, desktopVer, binVer);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/public/get-app-version")
    public ResponseEntity<ApiResponseFormat<Object>> getAppVersionInfo(
            @RequestBody String payload,
            @RequestHeader("X-Signature") String signature
    ) {
        var response = deviceService.getAppVersionInfo(signature, payload);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/public/app-version")
    public ResponseEntity<ApiResponseFormat<Object>> updateAppVersionInfo(
            @RequestBody AppVersionInfo request,
            @RequestHeader("X-Secret-Key") String key
    ) {
        var response = deviceService.updateAppVersionInfo(request, key);
        return responseFactory.response(SuccessCode.OK, response);
    }
}