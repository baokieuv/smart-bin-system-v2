package com.soict.smart_bin.controller;

import com.soict.smart_bin.common.ResponseFactory;
import com.soict.smart_bin.common.SuccessCode;
import com.soict.smart_bin.dto.core.ApiResponseFormat;
import com.soict.smart_bin.entity.User;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {
    private final ResponseFactory responseFactory;

    public UserController(ResponseFactory responseFactory){
        this.responseFactory = responseFactory;
    }

    @PostMapping("/")
    public ResponseEntity<ApiResponseFormat<Object>> createUser(){
        return responseFactory.response(SuccessCode.OK, "");
    }

    @GetMapping("/{userId}")
    public ResponseEntity<ApiResponseFormat<Object>> getUserById(){
        return responseFactory.response(SuccessCode.OK, "");
    }

    @PutMapping("/{userId}")
    public ResponseEntity<ApiResponseFormat<Object>> updateUserById(){
        return responseFactory.response(SuccessCode.OK, "");
    }

    @DeleteMapping("/{userId}")
    public ResponseEntity<ApiResponseFormat<Object>> deleteUserById(){
        return responseFactory.response(SuccessCode.OK, "");
    }
}
