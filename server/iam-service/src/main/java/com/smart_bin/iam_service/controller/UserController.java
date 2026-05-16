package com.smart_bin.iam_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.iam_service.common.SuccessCode;
import com.smart_bin.iam_service.dto.auth.request.UpdateUserStateRequest;
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

    @GetMapping
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> getUsers(
            @RequestParam(required = false, defaultValue = "1") Long page,
            @RequestParam(required = false, defaultValue = "10") Long size
    ){
        var users = userService.getUsers(page, size);
        return responseFactory.response(SuccessCode.OK, users);
    }

    @PatchMapping("/{userId}/global-status")
    @PreAuthorize("hasRole(T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> updateGlobalStatusById(
            @PathVariable("userId") String userId,
            @Valid @RequestBody UpdateUserStateRequest request
    ){
        var user = userService.updateUserStateById(userId, request);
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
}
