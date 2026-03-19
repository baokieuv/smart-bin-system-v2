package com.soict.smart_bin.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soict.smart_bin.common.DeviceStatus;
import com.soict.smart_bin.common.NotificationType;
import com.soict.smart_bin.dto.device.DeviceActivityWebhookRequest;
import com.soict.smart_bin.dto.device.DeviceDto;
import com.soict.smart_bin.entity.Device;
import com.soict.smart_bin.entity.User;
import com.soict.smart_bin.exception.ApiException;
import com.soict.smart_bin.exception.CoreErrorCode;
import com.soict.smart_bin.exception.DeviceErrorCode;
import com.soict.smart_bin.repository.DeviceRepository;
import jakarta.transaction.Transactional;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.codec.digest.HmacUtils;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.UUID;

@Service
@Slf4j
public class ThingsBoardService {
    private final RestClient restClient;
    private final DeviceRepository repository;
    private final NotificationService notificationService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${things-board.key}")
    private String secretKey;

    public ThingsBoardService(
            @Qualifier("tbRestClient") RestClient restClient,
            DeviceRepository repository,
            NotificationService notificationService
    ) {
        this.restClient = restClient;
        this.repository = repository;
        this.notificationService = notificationService;
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

    public JsonNode getTelemetries(String deviceId, String keys, Long startTs, Long endTs){
        return restClient.get()
                .uri(uriBuilder -> {
                    uriBuilder.path("/api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries");
                    if (keys != null && !keys.isBlank()) {
                        uriBuilder.queryParam("keys", keys);
                    }
                    if (startTs != null && endTs != null) {
                        uriBuilder.queryParam("startTs", startTs);
                        uriBuilder.queryParam("endTs", endTs);
                    }

                    return uriBuilder.build(deviceId);
                })
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

    public void deleteDevice(String tbDeviceId){
        restClient.delete()
                .uri("/api/device/{deviceId}", tbDeviceId)
                .retrieve()
                .toBodilessEntity();

        log.info("Delete device on ThingsBoard successfully!");
    }

    public String updateDeviceStatus(DeviceActivityWebhookRequest request) {
        if(System.currentTimeMillis() - request.timestamp() > 10000000){
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR);
        }

        Device device = repository.findByDeviceIdAndActiveTrue(request.deviceId()).orElseThrow(() ->
                new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        User owner = device.getUser();

        if (request.active() && device.getStatus() == DeviceStatus.OFFLINE) {

            device.setStatus(DeviceStatus.ONLINE);
            repository.save(device);
            notificationService.createAndSendNotification(
                    owner,
                    "Device Online",
                    "Smart bin " + device.getName() + " is now back online.",
                    NotificationType.DEVICE_ONLINE
            );
        } else if (!request.active() && device.getStatus() == DeviceStatus.ONLINE) {
            device.setStatus(DeviceStatus.OFFLINE);
            repository.save(device);
            notificationService.createAndSendNotification(
                    owner,
                    "Device Offline",
                    "Warning: Smart bin " + device.getName() + " has lost connection.",
                    NotificationType.DEVICE_OFFLINE
            );
        }

        return "Status Processed";
    }

    // Add this method to your ThingsBoardService.java

    @Transactional
    public String processDeviceAlarm(String signature, String payload) {
        // 1. Verify the webhook signature to ensure it's actually from ThingsBoard
        String serverSignature = new HmacUtils("HmacSHA256", secretKey).hmacHex(payload);

        if(!serverSignature.equalsIgnoreCase(signature)){
            log.warn("Invalid signature for alarm webhook");
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR);
        }

        try {
            // 2. Parse the ThingsBoard payload dynamically using JsonNode
            JsonNode alarmNode = objectMapper.readTree(payload);

            // Adjust these keys based on your exact ThingsBoard Rule Chain mapping
            String deviceIdStr = alarmNode.path("deviceId").asText();

            UUID deviceId;
            try {
                deviceId = UUID.fromString(deviceIdStr);
            } catch (IllegalArgumentException e) {
                throw new ApiException(CoreErrorCode.BAD_REQUEST);
            }

            String alarmType = alarmNode.path("alarmType").asText(); // e.g., "High Temperature", "Bin Full"
            String severity = alarmNode.path("severity").asText();   // e.g., "CRITICAL", "MAJOR", "WARNING"
            String status = alarmNode.path("status").asText();       // e.g., "ACTIVE_UNACK", "CLEARED_UNACK"

            // 3. Find the device and its owner
            Device device = repository.findByIdAndActiveTrue(deviceId).orElseThrow(() ->
                    new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

            User owner = device.getUser();

            if (status.startsWith("ACTIVE")) {
                String title = "Smart Bin Alarm: " + severity;
                String message = "Alarm '" + alarmType + "' was triggered for your bin: " + device.getName();

                // Send the real-time notification
                notificationService.createAndSendNotification(
                        owner,
                        title,
                        message,
                        NotificationType.SYSTEM_INFO
                );
                log.info("Processed active alarm for device {}: {}", deviceId, alarmType);
            } else if (status.startsWith("CLEARED")) {
                log.info("Alarm cleared for device {}: {}", deviceId, alarmType);
            }

            return "Alarm Processed Successfully";

        } catch (JsonProcessingException ex){
            log.error("Failed to parse ThingsBoard alarm payload: {}", payload, ex);
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR);
        }
    }
}
