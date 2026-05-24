package com.smart_bin.device_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.device_service.common.SuccessCode;
import com.smart_bin.device_service.dto.request.CreateDeviceGroupRequest;
import com.smart_bin.device_service.dto.request.UpdateDeviceGroupRequest;
import com.smart_bin.device_service.service.DeviceGroupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/device-groups")
@RequiredArgsConstructor
public class DeviceGroupController {

    private final ResponseFactory responseFactory;
    private final DeviceGroupService service;

    @GetMapping
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getAllDeviceGroups(
            @RequestParam(required = false, defaultValue = "1") Long page,
            @RequestParam(required = false, defaultValue = "10") Long size,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String keycloakId = jwt.getSubject();
        return responseFactory.response(SuccessCode.OK, service.getAllDeviceGroups(page, size, keycloakId));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getDeviceGroupById(
            @PathVariable String id,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String keycloakId = jwt.getSubject();
        return responseFactory.response(SuccessCode.OK, service.getDeviceGroupById(id, keycloakId));
    }

    @PostMapping
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> createDeviceGroup(
            @Valid @RequestBody CreateDeviceGroupRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String keycloakId = jwt.getSubject();
        return responseFactory.response(SuccessCode.CREATED, service.createDeviceGroup(request, keycloakId));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> updateDeviceGroup(
            @PathVariable String id,
            @Valid @RequestBody UpdateDeviceGroupRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String keycloakId = jwt.getSubject();
        return responseFactory.response(SuccessCode.OK, service.updateDeviceGroup(id, request, keycloakId));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> deleteDeviceGroup(
            @PathVariable String id,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String keycloakId = jwt.getSubject();
        return responseFactory.response(SuccessCode.OK, service.deleteDeviceGroup(id, keycloakId));
    }
}