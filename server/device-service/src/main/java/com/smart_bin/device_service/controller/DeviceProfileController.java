package com.smart_bin.device_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.device_service.common.SuccessCode;
import com.smart_bin.device_service.dto.request.CreateDeviceProfileRequest;
import com.smart_bin.device_service.service.DeviceProfileService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/device-profiles")
public class DeviceProfileController {
    private final DeviceProfileService service;
    private final ResponseFactory responseFactory;

    @GetMapping
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getAllDeviceGroups(
            @RequestParam(required = false, defaultValue = "1") Long page,
            @RequestParam(required = false, defaultValue = "10") Long size
    ) {
        return responseFactory.response(SuccessCode.OK, service.getAllDeviceProfiles(page, size));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getDeviceProfileById(
            @PathVariable String id
    ) {
        return responseFactory.response(SuccessCode.OK, service.getDeviceProfileById(id));
    }

    @PostMapping
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> createDeviceProfile(
            @Valid @RequestBody CreateDeviceProfileRequest request
    ) {
        return responseFactory.response(SuccessCode.CREATED, service.createDeviceProfile(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> updateDeviceProfile(
            @PathVariable String id,
            @Valid @RequestBody CreateDeviceProfileRequest request
    ) {
        return responseFactory.response(SuccessCode.OK, service.updateDeviceProfile(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> deleteDeviceProfile(
            @PathVariable String id
    ) {
        var response = service.deleteDeviceProfile(id);
        return responseFactory.response(SuccessCode.OK, response);
    }
}
