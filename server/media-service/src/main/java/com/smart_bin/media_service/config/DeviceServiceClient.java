package com.smart_bin.media_service.config;

import com.smart_bin.media_service.dto.request.RpcRequest;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@FeignClient(name = "device-service", url = "${app.device-service.url:http://localhost:2108}")
public interface DeviceServiceClient {

    @GetMapping("/api/v1/devices/internal/verify-permission")
    JsonNode verifyPermission(
            @RequestHeader("x-internal-secret") String internalSecret,
            @RequestParam("deviceMac") String deviceMac,
            @RequestParam("tenantId") String tenantId
    );

    @PostMapping("/api/v1/devices/internal/{deviceMac}/rpc")
    void deviceRPC(
            @RequestHeader("x-internal-secret") String internalSecret,
            @PathVariable("deviceMac") String deviceMac,
            @RequestBody RpcRequest request
    );
}
