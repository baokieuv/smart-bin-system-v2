package com.smart_bin.device_service.controller;

import com.smart_bin.core.common.UserRole;
import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.device_service.common.SuccessCode;
import com.smart_bin.device_service.dto.request.*;
import com.smart_bin.device_service.service.DeviceService;
import com.smart_bin.device_service.utils.HardwareSecureResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
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

    @PostMapping("/claim")
    public ResponseEntity<ApiResponseFormat<Object>> claimDevice(
            @Valid @RequestBody ClaimDeviceRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        // ID nội bộ của User lấy từ token Keycloak
        String userId = jwt.getSubject();
        var response = deviceService.claimDevice(request, userId);
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
            @RequestParam(required = false, defaultValue = "10") int size,
            @AuthenticationPrincipal Jwt jwt,
            Authentication authentication
    ){
        String actorId = jwt.getSubject();

        boolean isSuperAdmin = authentication.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equalsIgnoreCase(UserRole.SUPER_ADMIN.getRoleName()) ||
                        auth.getAuthority().equalsIgnoreCase("ROLE_" + UserRole.SUPER_ADMIN.getRoleName()));

        var response = deviceService.getAllDevicesForAdmin(page, size, actorId, isSuperAdmin);
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
    public ResponseEntity<ApiResponseFormat<Object>> provisionDevice(
            @Valid @RequestBody DeviceProvisionRequest request
    ) {
        var response = deviceService.provisionDevice(request);
        return responseFactory.response(SuccessCode.OK, response);
    }
}