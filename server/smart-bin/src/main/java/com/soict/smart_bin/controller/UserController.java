package com.soict.smart_bin.controller;

import com.soict.smart_bin.common.ResponseFactory;
import com.soict.smart_bin.common.SuccessCode;
import com.soict.smart_bin.dto.core.ApiResponseFormat;
import com.soict.smart_bin.dto.user.CreateUserRequest;
import com.soict.smart_bin.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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

    @PutMapping("/{userId}")
    public ResponseEntity<ApiResponseFormat<Object>> updateUserById(@PathVariable String userId){
        return responseFactory.response(SuccessCode.OK, "");
    }

    @DeleteMapping("/{userId}")
    public ResponseEntity<ApiResponseFormat<Object>> deleteUserById(@PathVariable String userId){
        userService.deleteUserById(userId);
        return responseFactory.response(SuccessCode.OK, "User deleted successfully");
    }
}
