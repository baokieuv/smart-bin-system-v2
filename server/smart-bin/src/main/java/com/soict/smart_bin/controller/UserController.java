package com.soict.smart_bin.controller;

import com.soict.smart_bin.utils.ResponseFactory;
import com.soict.smart_bin.common.SuccessCode;
import com.soict.smart_bin.dto.core.ApiResponseFormat;
import com.soict.smart_bin.dto.user.CreateUserRequest;
import com.soict.smart_bin.service.UserService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.oauth2.jwt.Jwt;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {
    private final ResponseFactory responseFactory;
    private final UserService userService;

    @PostMapping("/")
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
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();
        return responseFactory.response(SuccessCode.OK, "");
    }

    @PostMapping("/upload-image")
    public ResponseEntity<ApiResponseFormat<Object>> uploadImage(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String keycloakId = jwt.getSubject();

        String url = userService.validateAndUploadImage(file, keycloakId);

        return responseFactory.response(SuccessCode.OK, url);
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
