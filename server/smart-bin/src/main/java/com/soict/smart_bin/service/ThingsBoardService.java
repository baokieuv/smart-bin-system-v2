package com.soict.smart_bin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.soict.smart_bin.dto.auth.LoginRequest;
import com.soict.smart_bin.dto.auth.LoginResponse;
import com.soict.smart_bin.dto.auth.RefreshTokenRequest;
import com.soict.smart_bin.entity.Device;
import com.soict.smart_bin.exception.ApiException;
import com.soict.smart_bin.exception.CoreErrorCode;
import com.soict.smart_bin.repository.DeviceRepository;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class ThingsBoardService {
    private final RestClient restClient;
    private final DeviceRepository repository;

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
        Device device = repository.findByIdAndActiveTrue(deviceId).orElseThrow(() ->
                new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR));

        return restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries")
                        .queryParam("keys", keys)
                        .queryParam("startTs", startTs)
                        .queryParam("endTs", endTs)
                        .build(device.getDeviceId()))
                .retrieve()
                .body(JsonNode.class);
    }

    public JsonNode getAttributes(String deviceId, String keys){
        Device device = repository.findByIdAndActiveTrue(deviceId).orElseThrow(() ->
                new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR));

        return restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/plugins/telemetry/DEVICE/{deviceId}/values/attributes")
                        .queryParam("keys", keys)
                        .build(device.getDeviceId()))
                .retrieve()
                .body(JsonNode.class);
    }
}
