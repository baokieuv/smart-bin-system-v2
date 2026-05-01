package com.smart_bin.iam_service.controller;

import com.smart_bin.core.common.UserRole;
import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.iam_service.common.SuccessCode;
import com.smart_bin.iam_service.dto.auth.request.UpdateUserAccessRequest;
import com.smart_bin.iam_service.dto.user.request.CreateUserRequest;
import com.smart_bin.iam_service.dto.user.request.UpdateUserRequest;
import com.smart_bin.iam_service.serivce.UserService;
import com.smart_bin.iam_service.utils.RequireCaptcha;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {
    private final ResponseFactory responseFactory;
    private final UserService userService;

    @PostMapping
    @RequireCaptcha(action = "REGISTER")
    public ResponseEntity<ApiResponseFormat<Object>> createUser(@Valid @RequestBody CreateUserRequest request){
        var user = userService.createUser(request);
        return responseFactory.response(SuccessCode.CREATED, user);
    }

    @GetMapping("/{userId}")
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getUserById(@PathVariable String userId){
        var user = userService.getUserById(userId);
        return responseFactory.response(SuccessCode.OK, user);
    }

    @PutMapping
    public ResponseEntity<ApiResponseFormat<Object>> updateUserById(
            @Valid @RequestBody UpdateUserRequest request,
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();
        var user = userService.updateUser(keycloakId, request);
        return responseFactory.response(SuccessCode.OK, user);
    }

    @DeleteMapping("/{targetUserId}")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> deleteUserById(
            @PathVariable("targetUserId") String targetUserId, // Map đúng tên
            @AuthenticationPrincipal Jwt jwt
    ){
        String actorId = jwt.getSubject();

        userService.deleteUserById(actorId, targetUserId);

        return responseFactory.response(SuccessCode.OK, "User deleted successfully");
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponseFormat<Object>> getCurrentUser(@AuthenticationPrincipal Jwt jwt) {
        String keycloakId = jwt.getSubject();
        var user = userService.getUserByKeycloakId(keycloakId);
        return responseFactory.response(SuccessCode.OK, user);
    }

    @PostMapping("/access")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> changeUserAccess(
            @Valid @RequestBody UpdateUserAccessRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {

        UserRole targetRole;
        try {
            targetRole = UserRole.fromString(request.roleName()); // Lấy từ record DTO
        } catch (IllegalArgumentException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Role không hợp lệ. Chỉ chấp nhận USER, ADMIN hoặc SUPER_ADMIN");
        }

        String actorId = jwt.getSubject();

        userService.updateUserRole(actorId, request.targetUserId(), targetRole);

        return responseFactory.response(SuccessCode.OK, "Cập nhật quyền thành công");
    }
}
