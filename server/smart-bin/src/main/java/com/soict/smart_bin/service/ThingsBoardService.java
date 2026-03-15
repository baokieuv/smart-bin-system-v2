package com.soict.smart_bin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soict.smart_bin.dto.auth.LoginRequest;
import com.soict.smart_bin.dto.auth.LoginResponse;
import com.soict.smart_bin.dto.auth.RefreshTokenRequest;
import com.soict.smart_bin.entity.Device;
import com.soict.smart_bin.exception.ApiException;
import com.soict.smart_bin.exception.CoreErrorCode;
import com.soict.smart_bin.repository.DeviceRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.http.HttpStatusCode;

import java.util.Map;

@Service
@Slf4j
public class ThingsBoardService {
    private final RestClient restClient;
    private final DeviceRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ThingsBoardService(@Qualifier("tbRestClient") RestClient restClient, DeviceRepository repository) {
        this.restClient = restClient;
        this.repository = repository;
    }

    public JsonNode addDevice(String name, String type) {
        var tbRequest = new java.util.HashMap<String, String>();
        tbRequest.put("name", name);
        tbRequest.put("type", type);

        return restClient.post()
                .uri("/api/device")
                .body(tbRequest)
                .retrieve()
                .body(JsonNode.class);
    }

    public JsonNode getDeviceCredentials(String tbDeviceId) {
        return restClient.get()
                .uri("/api/device/{deviceId}/credentials", tbDeviceId)
                .retrieve()
                .body(JsonNode.class);
    }

    public JsonNode getTelemetries(String deviceId, String keys, long startTs, long endTs){
        return restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries")
                        .queryParam("keys", keys)
                        .queryParam("startTs", startTs)
                        .queryParam("endTs", endTs)
                        .build(deviceId))
                .retrieve()
                .body(JsonNode.class);
    }

    public void updateAttributes(String deviceId, String scope, Map<String, Object> attributes){
        if (attributes == null || attributes.isEmpty()){
            log.info("Không có attributes nào để cập nhật cho thiết bị {}", deviceId);
            return;
        }

        restClient.post()
                .uri("/api/plugins/telemetry/DEVICE/{deviceId}/attributes/{scope}", deviceId, scope)
                .body(attributes)
                .retrieve()
                .toBodilessEntity();

        log.info("Cập nhật thuộc tính thành công cho thiết bị {}!", deviceId);
    }

    public JsonNode getAttributes(String deviceId, String keys){
        return restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/plugins/telemetry/DEVICE/{deviceId}/values/attributes")
                        .queryParam("keys", keys)
                        .build(deviceId))
                .retrieve()
                .body(JsonNode.class);
    }
}
