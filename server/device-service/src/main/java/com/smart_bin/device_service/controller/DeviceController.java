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
import org.springframework.security.core.GrantedAuthority;

import java.util.Comparator;
import java.util.Objects;

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
        var response = deviceService.importDevicesByTenant(request, actorId);
        return responseFactory.response(SuccessCode.CREATED, response);
    }

    @PostMapping("/claim")
    public ResponseEntity<ApiResponseFormat<Object>> claimDevice(
            @Valid @RequestBody ClaimDeviceRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String userId = jwt.getSubject();
        String tenantId = jwt.getClaimAsString("tenant_id");
        var response = deviceService.claimDevice(request, userId, tenantId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping
    public ResponseEntity<ApiResponseFormat<Object>> getListDevices(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false, defaultValue = "1") int page,
            @RequestParam(required = false, defaultValue = "10") int size
    ){
        String keycloakId = jwt.getSubject();
        String tenantId = jwt.getClaimAsString("tenant_id");
        String permissions = jwt.getClaimAsString("device_permissions");

        var response = deviceService.getListDevices(keycloakId, tenantId, permissions, page, size);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/admin")
//    @PreAuthorize("hasAnyRole(" +
//            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
//            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getAllDevicesForAdmin(
            @RequestParam(required = false, defaultValue = "1") int page,
            @RequestParam(required = false, defaultValue = "10") int size,
            @AuthenticationPrincipal Jwt jwt,
            Authentication authentication
    ){
        String actorId = jwt.getSubject();
        String tenantId = jwt.getClaimAsString("tenant_id");

        boolean isSuperAdmin = authentication.getAuthorities().stream()
                .anyMatch(auth -> Objects.requireNonNull(auth.getAuthority()).equalsIgnoreCase(UserRole.SUPER_ADMIN.getRoleName()) ||
                        auth.getAuthority().equalsIgnoreCase("ROLE_" + UserRole.SUPER_ADMIN.getRoleName()));

        var response = deviceService.getAllDevicesForAdmin(page, size, actorId, tenantId, isSuperAdmin);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/{deviceId}")
    public ResponseEntity<ApiResponseFormat<Object>> getDeviceDetail(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String deviceId
    ){
        String keycloakId = jwt.getSubject();
        String tenantId = jwt.getClaimAsString("tenant_id");
        String permissions = jwt.getClaimAsString("device_permissions");

        var response = deviceService.getDeviceDetail(keycloakId, tenantId, deviceId, permissions);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/{deviceId}")
    public ResponseEntity<ApiResponseFormat<Object>> updateDevice(
            @Valid @RequestBody UpdateDeviceUserRequest request,
            @PathVariable String deviceId,
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();
        String tenantId = jwt.getClaimAsString("tenant_id");
        String permissions = jwt.getClaimAsString("device_permissions");

        var response = deviceService.updateDeviceByUser(deviceId, request, keycloakId, tenantId, permissions);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/tenant/{deviceId}")
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> updateDeviceByTenant(
            @Valid @RequestBody UpdateDeviceTenantRequest request,
            @PathVariable String deviceId,
            @AuthenticationPrincipal Jwt jwt
    ){
        String tenantId = jwt.getSubject();
        var response = deviceService.updateDeviceByTenant(deviceId, request, tenantId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/assign-group")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> assignDevicesToGroup(
            @Valid @RequestBody AssignDevicesToGroupRequest request,
            @AuthenticationPrincipal Jwt jwt
    ){
        String tenantId = jwt.getSubject();
        var response = deviceService.assignDevicesToGroup(request, tenantId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/assign-user")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> assignDevicesToUser(
            @Valid @RequestBody AssignDeviceToUserRequest request,
            @AuthenticationPrincipal Jwt jwt
    ){
        String tenantId = jwt.getSubject();
        var response = deviceService.assignDevicesToUser(request, tenantId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @DeleteMapping("/{deviceId}")
    public ResponseEntity<ApiResponseFormat<Object>> deleteDevice(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String deviceId
    ){
        String keycloakId = jwt.getSubject();
        String tenantId = jwt.getClaimAsString("tenant_id");
        String permissions = jwt.getClaimAsString("device_permissions");

        deviceService.deleteDevice(deviceId, keycloakId, tenantId, permissions);
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
        String tenantId = jwt.getClaimAsString("tenant_id");
        String permissions = jwt.getClaimAsString("device_permissions");

        var response = deviceService.getTelemetries(deviceId, keycloakId, tenantId, permissions, keys, startTs, endTs);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/{deviceId}/rpc")
    public ResponseEntity<ApiResponseFormat<Object>> executeCommand(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String deviceId,
            @RequestBody RpcRequest request,
            Authentication authentication
    ){
        String keycloakId = jwt.getSubject();
        String tenantId = jwt.getClaimAsString("tenant_id");
        String permissions = jwt.getClaimAsString("device_permissions");

        UserRole role = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority).filter(Objects::nonNull)
                .map(auth -> auth.replaceFirst("^ROLE_", ""))
                .map(authName -> {
                    try {
                        return UserRole.fromString(authName);
                    } catch (IllegalArgumentException e) {
                        return null;
                    }
                })
                .filter(Objects::nonNull)
                .max(Comparator.comparingInt(UserRole::getValue))
               .orElse(UserRole.USER);

        var response = deviceService.executeRpc(deviceId, request, keycloakId, tenantId, role, permissions);
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
            @RequestHeader("X-Signature") String signature,
            @RequestBody String request
    ) {
        var response = deviceService.provisionDevice(request, signature);
        return responseFactory.response(SuccessCode.OK, response);
    }
}