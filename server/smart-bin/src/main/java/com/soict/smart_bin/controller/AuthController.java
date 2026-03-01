package com.soict.smart_bin.controller;

import com.soict.smart_bin.common.ResponseFactory;
import com.soict.smart_bin.common.SuccessCode;
import com.soict.smart_bin.dto.auth.ChangePasswordRequest;
import com.soict.smart_bin.dto.auth.LoginRequest;
import com.soict.smart_bin.dto.auth.LogoutRequest;
import com.soict.smart_bin.dto.core.ApiResponseFormat;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final ResponseFactory responseFactory;

    public AuthController(ResponseFactory responseFactory){
        this.responseFactory = responseFactory;
    }

    @PostMapping("/login-password")
    public ResponseEntity<ApiResponseFormat<Object>> loginPassword(
            @Valid @RequestBody LoginRequest request)
    {
        return responseFactory.response(SuccessCode.OK, "");
    }

    @PostMapping("/login-google")
    public ResponseEntity<ApiResponseFormat<Object>> loginGoogle(){
        return responseFactory.response(SuccessCode.OK, "");
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponseFormat<Object>> logout(
            @Valid @RequestBody LogoutRequest request
    ){
        return responseFactory.response(SuccessCode.OK, "");
    }

    @PostMapping("/change-password")
    public ResponseEntity<ApiResponseFormat<Object>> changePassword(
            @Valid @RequestBody ChangePasswordRequest request
    ){
        return responseFactory.response(SuccessCode.OK, "");
    }

    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponseFormat<Object>> resetPassword(){
        return responseFactory.response(SuccessCode.OK, "");
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponseFormat<Object>> getCurrentUser(){
        return responseFactory.response(SuccessCode.OK, "");
    }
}
