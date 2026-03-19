package com.soict.smart_bin.controller;

import com.soict.smart_bin.common.SuccessCode;
import com.soict.smart_bin.dto.core.ApiResponseFormat;
import com.soict.smart_bin.dto.device.DeviceActivityWebhookRequest;
import com.soict.smart_bin.service.ThingsBoardService;
import com.soict.smart_bin.utils.ResponseFactory;
import jakarta.validation.Valid;
import jakarta.ws.rs.HeaderParam;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
            @HeaderParam("signature") String signature,
            @RequestBody String payload
    ){
        var response = service.processDeviceAlarm(signature, payload);
        return responseFactory.response(SuccessCode.OK, response);
    }
}
