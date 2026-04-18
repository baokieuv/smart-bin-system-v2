package com.smart_bin.iam_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.iam_service.common.SuccessCode;
import com.smart_bin.iam_service.dto.user.request.CreateUserRequest;
import com.smart_bin.iam_service.dto.user.request.UpdateUserRequest;
import com.smart_bin.iam_service.serivce.UserService;
import com.smart_bin.iam_service.utils.RequireCaptcha;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {
    private final ResponseFactory responseFactory;
    private final UserService userService;

    @PostMapping("/")
    @RequireCaptcha(action = "REGISTER")
    public ResponseEntity<ApiResponseFormat<Object>> createUser(@Valid @RequestBody CreateUserRequest request){
        var user = userService.createUser(request);
        return responseFactory.response(SuccessCode.CREATED, user);
    }

    @GetMapping("/{userId}")
    public ResponseEntity<ApiResponseFormat<Object>> getUserById(@PathVariable String userId){
        var user = userService.getUserById(userId);
        return responseFactory.response(SuccessCode.OK, user);
    }

    @PutMapping("/")
    public ResponseEntity<ApiResponseFormat<Object>> updateUserById(
            @Valid @RequestBody UpdateUserRequest request,
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();
        var user = userService.updateUser(keycloakId, request);
        return responseFactory.response(SuccessCode.OK, user);
    }

    @DeleteMapping("/")
    public ResponseEntity<ApiResponseFormat<Object>> deleteUserById(
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();
        userService.deleteUserById(keycloakId);
        return responseFactory.response(SuccessCode.OK, "User deleted successfully");
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponseFormat<Object>> getCurrentUser(@AuthenticationPrincipal Jwt jwt) {
        String keycloakId = jwt.getSubject();
        var user = userService.getUserByKeycloakId(keycloakId);
        return responseFactory.response(SuccessCode.OK, user);
    }
}
