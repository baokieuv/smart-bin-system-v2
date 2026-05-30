package com.smart_bin.device_service.config;

import org.springframework.web.bind.annotation.GetMapping;
import tools.jackson.databind.JsonNode;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "iam-service", url = "${app.iam-service.url:http://localhost:2106}")
public interface IamServiceClient {

    @GetMapping("/api/v1/tenants/verify-secret")
    JsonNode verifyTenantSecret(
            @RequestHeader("x-internal-secret") String internalSecret,
            @RequestParam("secret") String secret
    );

    @PostMapping("/api/v1/tenants/verify-user")
    JsonNode verifyUserInTenant(
            @RequestHeader("x-internal-secret") String internalSecret,
            @RequestParam("tenantId") String tenantId,
            @RequestParam("userId") String userId
    );
}
