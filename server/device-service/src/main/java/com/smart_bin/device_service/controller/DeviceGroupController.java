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
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/device-groups")
@RequiredArgsConstructor
public class DeviceGroupController {

    private final ResponseFactory responseFactory;
    private final DeviceGroupService service;

    @GetMapping
    public ResponseEntity<ApiResponseFormat<Object>> getAllDeviceGroups(
            @RequestParam(required = false, defaultValue = "1") Long page,
            @RequestParam(required = false, defaultValue = "10") Long size
    ) {
        return responseFactory.response(SuccessCode.OK, service.getAllDeviceGroups(page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponseFormat<Object>> getDeviceGroupById(@PathVariable String id) {
        return responseFactory.response(SuccessCode.OK, service.getDeviceGroupById(id));
    }

    @PostMapping
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> createDeviceGroup(@Valid @RequestBody CreateDeviceGroupRequest request) {
        return responseFactory.response(SuccessCode.CREATED, service.createDeviceGroup(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> updateDeviceGroup(
            @PathVariable String id,
            @Valid @RequestBody UpdateDeviceGroupRequest request
    ) {
        return responseFactory.response(SuccessCode.OK, service.updateDeviceGroup(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> deleteDeviceGroup(@PathVariable String id) {
        return responseFactory.response(SuccessCode.OK, service.deleteDeviceGroup(id));
    }
}