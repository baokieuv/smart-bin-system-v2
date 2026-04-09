package com.soict.smart_bin.controller;


import com.soict.smart_bin.utils.ResponseFactory;
import com.soict.smart_bin.common.SuccessCode;
import com.soict.smart_bin.dto.core.ApiResponseFormat;
import com.soict.smart_bin.dto.device.CreateDeviceRequest;
import com.soict.smart_bin.dto.device.UpdateDeviceRequest;
import com.soict.smart_bin.service.DeviceService;
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

    @GetMapping("/")
    public ResponseEntity<ApiResponseFormat<Object>> getListDevices(
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();
        var response = deviceService.getListDevices(keycloakId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/{deviceId}")
    public ResponseEntity<ApiResponseFormat<Object>> getDeviceDetail(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String deviceId
    ){
        String keycloakId = jwt.getSubject();
        var response = deviceService.getDeviceDetail(keycloakId, deviceId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/{deviceId}")
    public ResponseEntity<ApiResponseFormat<Object>> updateDevice(
            @Valid @RequestBody UpdateDeviceRequest request,
            @PathVariable String deviceId,
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();
        var response = deviceService.updateDevice(deviceId, request, keycloakId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @DeleteMapping("/{deviceId}")
    public ResponseEntity<ApiResponseFormat<Object>> deleteDevice(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String deviceId
    ){
        String keycloakId = jwt.getSubject();
        deviceService.deleteDevice(deviceId, keycloakId);
        return responseFactory.response(SuccessCode.OK, "Deleted device successfully!");
    }

    @PostMapping("/activate")
    public ResponseEntity<ApiResponseFormat<Object>> activateDevice(
            @RequestBody String payload,
            @RequestHeader("X-Signature") String signature
    ){
        var response = deviceService.activateDevice(payload, signature);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/get-access-token")
    public ResponseEntity<ApiResponseFormat<Object>> getAccessToken(
            @RequestBody String payload,
            @RequestHeader("X-Signature") String signature
    ){
        var response = deviceService.getAccessToken(payload, signature);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/{deviceId}/telemetries")
    public ResponseEntity<ApiResponseFormat<Object>> getTelemetries(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String deviceId,
            @RequestParam(required = false) String keys,
            @RequestParam(required = false) Long startTs,
            @RequestParam(required = false) Long endTs
    ){
        String keycloakId = jwt.getSubject();
        var response = deviceService.getTelemetries(deviceId, keycloakId, keys, startTs, endTs);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/{deviceId}/attributes")
    public ResponseEntity<ApiResponseFormat<Object>> getAttributes(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String deviceId,
            @RequestParam(required = false, defaultValue = "") String keys
    ){
        String keycloakId = jwt.getSubject();
        var response = deviceService.getAttributes(deviceId, keycloakId, keys);
        return responseFactory.response(SuccessCode.OK, response);
    }
}
