package com.soict.smart_bin.controller;


import com.soict.smart_bin.common.ResponseFactory;
import com.soict.smart_bin.common.SuccessCode;
import com.soict.smart_bin.dto.core.ApiResponseFormat;
import com.soict.smart_bin.service.AuthService;
import com.soict.smart_bin.service.DeviceService;
import com.soict.smart_bin.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceController {

    private final ResponseFactory responseFactory;
    private final DeviceService deviceService;

    public ResponseEntity<ApiResponseFormat<Object>> addDevice(){
        return responseFactory.response(SuccessCode.OK, "");
    }

    public ResponseEntity<ApiResponseFormat<Object>> updateDevice(){
        return responseFactory.response(SuccessCode.OK, "");
    }

    public ResponseEntity<ApiResponseFormat<Object>> deleteDevice(){
        return responseFactory.response(SuccessCode.OK, "");
    }

    public ResponseEntity<ApiResponseFormat<Object>> getTelemetries(){
        return responseFactory.response(SuccessCode.OK, "");
    }

    public ResponseEntity<ApiResponseFormat<Object>> getAttributes(){
        return responseFactory.response(SuccessCode.OK, "");
    }
}
