package com.smart_bin.iam_service.controller;

import com.smart_bin.core.common.UserRole;
import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.iam_service.common.SuccessCode;
import com.smart_bin.iam_service.dto.auth.request.CreateTenantRequest;
import com.smart_bin.iam_service.dto.auth.request.UpdateTenantStatusRequest;
import com.smart_bin.iam_service.dto.auth.request.UpdateTenantUserStatusRequest;
import com.smart_bin.iam_service.serivce.TenantService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/tenants")
@RequiredArgsConstructor
public class TenantController {
    private final TenantService service; // Đã thêm final để RequiredArgsConstructor hoạt động
    private final ResponseFactory responseFactory;

    @PostMapping
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> createTenant(
            @Valid @RequestBody CreateTenantRequest request
    ){
        var response = service.createTenant(request);
        return responseFactory.response(SuccessCode.CREATED, response);
    }

    @GetMapping
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getListTenants(
            @RequestParam(required = false, defaultValue = "1") Long page,
            @RequestParam(required = false, defaultValue = "10") Long size
    ){
        var response = service.getListTenants(page, size);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> updateTenantStatus(
            @PathVariable("id") String id,
            @Valid @RequestBody UpdateTenantStatusRequest request,
            @AuthenticationPrincipal Jwt jwt
    ){
        String actorId = jwt.getSubject();
        var response = service.updateTenantStatus(id, actorId, request);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/users")
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getTenantUsers(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false, defaultValue = "1") Long page,
            @RequestParam(required = false, defaultValue = "10") Long size,
            Authentication authentication
    ){
        String tenantKeycloakId = jwt.getSubject();

        boolean isSuperAdmin = authentication.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equalsIgnoreCase(UserRole.SUPER_ADMIN.getRoleName()) ||
                        auth.getAuthority().equalsIgnoreCase("ROLE_" + UserRole.SUPER_ADMIN.getRoleName()));

        var response = service.getTenantUsers(tenantKeycloakId, isSuperAdmin, page, size);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/users/{userId}/tenant-status")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> updateTenantUserStatus(
            @PathVariable("userId") String targetUserId,
            @Valid @RequestBody UpdateTenantUserStatusRequest request,
            @AuthenticationPrincipal Jwt jwt
    ){
        String tenantKeycloakId = jwt.getSubject();
        var response = service.updateTenantUserStatus(tenantKeycloakId, targetUserId, request.tenantStatus());
        return responseFactory.response(SuccessCode.OK, response);
    }

//    @GetMapping("/verify-secret")
//    public ResponseEntity<ApiResponseFormat<Object>> verifyTenantSecret(
//            @RequestHeader("x-internal-secret") String internalSecret,
//            @RequestParam("secret") String secret
//    ) {
//        var response = service.verifyTenantSecret(internalSecret, secret);
//        return responseFactory.response(SuccessCode.OK, response);
//    }

    @PostMapping("/verify-user")
    public ResponseEntity<ApiResponseFormat<Object>> mapTenantToUser(
            @RequestHeader("x-internal-secret") String internalSecret,
            @RequestParam("tenantId") String tenantId,
            @RequestParam("userId") String userId
    ) {
        var response = service.verifyUserInTenant(tenantId, userId, internalSecret);
        return responseFactory.response(SuccessCode.OK, response);
    }
}