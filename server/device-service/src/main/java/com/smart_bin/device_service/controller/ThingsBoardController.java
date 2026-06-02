package com.smart_bin.device_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.device_service.common.SuccessCode;
import com.smart_bin.device_service.dto.request.DeviceActivityWebhookRequest;
import com.smart_bin.device_service.service.ThingsBoardService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/things-board")
@RequiredArgsConstructor
public class ThingsBoardController {

    private final ResponseFactory responseFactory;
    private final ThingsBoardService service;

    @PostMapping("/update-status")
    public ResponseEntity<ApiResponseFormat<Object>> updateDeviceStatus(
            @Valid @RequestBody DeviceActivityWebhookRequest payload
    ){

        var response = service.updateDeviceStatus(payload);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/alarms")
    public ResponseEntity<ApiResponseFormat<Object>> handleThingsBoardAlarm(
            @RequestHeader(value = "signature", required = false) String signature,
            @RequestBody String payload
    ){
        var response = service.processDeviceAlarm(signature, payload);
        return responseFactory.response(SuccessCode.OK, response);
    }
}
