package com.smart_bin.device_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.device_service.common.SuccessCode;
import com.smart_bin.device_service.dto.request.CreateFirmwareMappingRequest;
import com.smart_bin.device_service.dto.request.UpdateFirmwareMappingRequest;
import com.smart_bin.device_service.service.FirmwareMappingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/firmware-mappings")
@RequiredArgsConstructor
public class FirmwareMappingController {

    private final FirmwareMappingService mappingService;
    private final ResponseFactory responseFactory;

    @PostMapping
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> createMapping(@Valid @RequestBody CreateFirmwareMappingRequest request) {
        var response = mappingService.createMapping(request);
        return responseFactory.response(SuccessCode.CREATED, response);
    }

    @GetMapping
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getMappings(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return responseFactory.response(SuccessCode.OK, mappingService.getMappings(page, size));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getMappingById(@PathVariable String id) {
        var response = mappingService.getMappingById(id);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> updateMapping(
            @PathVariable String id,
            @Valid @RequestBody UpdateFirmwareMappingRequest request
    ) {
        var response = mappingService.updateMapping(id, request);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> deleteMapping(@PathVariable String id) {
        mappingService.deleteMapping(id);
        return responseFactory.response(SuccessCode.OK, "Đã xóa quy tắc cấu hình thành công.");
    }
}