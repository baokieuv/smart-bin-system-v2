package com.smart_bin.iam_service.controller;

import com.smart_bin.core.common.UserRole;
import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.iam_service.common.SuccessCode;
import com.smart_bin.iam_service.dto.auth.request.UpdateUserStateRequest;
import com.smart_bin.iam_service.dto.user.request.CreateUserRequest;
import com.smart_bin.iam_service.dto.user.request.UpdateUserByTenantRequest;
import com.smart_bin.iam_service.dto.user.request.UpdateUserRequest;
import com.smart_bin.iam_service.serivce.UserService;
import com.smart_bin.iam_service.utils.RequireCaptcha;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.Objects;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {
    private final ResponseFactory responseFactory;
    private final UserService userService;

    @PostMapping
    @RequireCaptcha(action = "REGISTER")
    public ResponseEntity<ApiResponseFormat<Object>> createUser(
            @Valid @RequestBody CreateUserRequest request,
            @AuthenticationPrincipal Jwt jwt,
            Authentication authentication
    ) {
        String tenantKeycloakId = null;
        boolean isTenant = false;

        if (jwt != null && authentication != null) {
            tenantKeycloakId = jwt.getSubject();

            isTenant = authentication.getAuthorities().stream()
                    .anyMatch(auth -> Objects.requireNonNull(auth.getAuthority()).equalsIgnoreCase(UserRole.ADMIN.getRoleName()) ||
                            auth.getAuthority().equalsIgnoreCase("ROLE_" + UserRole.ADMIN.getRoleName()));
        }

        var user = userService.createUser(request, tenantKeycloakId, isTenant);

        return responseFactory.response(SuccessCode.CREATED, user);
    }

    @GetMapping
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getUsers(
            @RequestParam(required = false, defaultValue = "1") Long page,
            @RequestParam(required = false, defaultValue = "10") Long size
    ){
        var users = userService.getUsers(page, size);
        return responseFactory.response(SuccessCode.OK, users);
    }

    @PutMapping("/{userId}/state")
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> updateGlobalStatusById(
            @PathVariable("userId") String userId,
            @Valid @RequestBody UpdateUserStateRequest request
    ){
        var user = userService.updateUserStateById(userId, request);
        return responseFactory.response(SuccessCode.OK, user);
    }

    @PutMapping("/{userId}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> updateUserByTenant(
            @PathVariable("userId") String userId,
            @Valid @RequestBody UpdateUserByTenantRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        // Lấy Keycloak ID của Tenant đang thực hiện request
        String tenantKeycloakId = jwt.getSubject();

        var user = userService.updateUserByTenant(userId, tenantKeycloakId, request);
        return responseFactory.response(SuccessCode.OK, user);
    }

    @DeleteMapping("/{targetUserId}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> deleteUserById(
            @PathVariable("targetUserId") String targetUserId
    ){
        userService.deleteUserById(targetUserId);
        return responseFactory.response(SuccessCode.OK, "User deleted successfully");
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponseFormat<Object>> getCurrentUser(@AuthenticationPrincipal Jwt jwt) {
        String keycloakId = jwt.getSubject();
        var user = userService.getUserByKeycloakId(keycloakId);
        return responseFactory.response(SuccessCode.OK, user);
    }

    @PutMapping("/me")
    public ResponseEntity<ApiResponseFormat<Object>> updateMyProfile(
            @Valid @RequestBody UpdateUserRequest request,
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();
        var user = userService.updateUser(keycloakId, request);
        return responseFactory.response(SuccessCode.OK, user);
    }

    @GetMapping("/internal")
    public ResponseEntity<ApiResponseFormat<Object>> getUserByIdInternal(
            @RequestParam("userId") String userId,
            @RequestHeader("x-internal-secret") String secret
    ){
        var user = userService.getUserByIdInternal(userId, secret);
        return responseFactory.response(SuccessCode.OK, user);
    }
}
