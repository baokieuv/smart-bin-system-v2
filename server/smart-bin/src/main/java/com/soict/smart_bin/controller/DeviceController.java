package com.soict.smart_bin.controller;


import com.soict.smart_bin.common.ResponseFactory;
import com.soict.smart_bin.common.SuccessCode;
import com.soict.smart_bin.dto.core.ApiResponseFormat;
import com.soict.smart_bin.dto.device.CreateDeviceRequest;
import com.soict.smart_bin.dto.device.UpdateDeviceRequest;
import com.soict.smart_bin.service.AuthService;
import com.soict.smart_bin.service.DeviceService;
import com.soict.smart_bin.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceController {

    private final ResponseFactory responseFactory;
    private final DeviceService deviceService;

    @PostMapping("/")
    public ResponseEntity<ApiResponseFormat<Object>> addDevice(
            @Valid @RequestBody CreateDeviceRequest request,
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();
        var response = deviceService.addDevice(request, keycloakId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/{deviceId}")
    public ResponseEntity<ApiResponseFormat<Object>> updateDevice(
            @Valid @RequestBody UpdateDeviceRequest request,
            @PathVariable String deviceId
    ){
        var response = deviceService.updateDevice(deviceId, request);
        return responseFactory.response(SuccessCode.OK, response);
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
