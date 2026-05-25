package com.smart_bin.device_service.service;

import com.smart_bin.core.common.NotificationType;
import com.smart_bin.core.dto.NotificationEventDto;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.device_service.common.DeviceStatus;
import com.smart_bin.device_service.dto.request.DeviceActivityWebhookRequest;
import com.smart_bin.device_service.entity.Device;
import com.smart_bin.device_service.exception.DeviceErrorCode;
import com.smart_bin.device_service.repository.DeviceRepository;
import jakarta.transaction.Transactional;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.codec.digest.HmacUtils;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
@Slf4j
public class ThingsBoardService {

    private final RestClient restClient;
    private final DeviceRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final KafkaService kafkaService;

    @Value("${things-board.key}")
    private String secretKey;

    public ThingsBoardService(
            @Qualifier("tbRestClient") RestClient restClient,
            DeviceRepository repository,
            KafkaService kafkaService
    ) {
        this.restClient = restClient;
        this.repository = repository;
        this.kafkaService = kafkaService;
    }

    public JsonNode addDevice(String name, String type) {
        var tbRequest = new HashMap<String, String>();
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

    // =========================================================================
    // XỬ LÝ WEBHOOK TỪ THINGSBOARD GỬI VỀ
    // =========================================================================

    public String updateDeviceStatus(DeviceActivityWebhookRequest request) {
        if(System.currentTimeMillis() - request.timestamp() > 10000000){
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Webhook timeout");
        }

        Device device = repository.findByDeviceIdAndActiveTrue(request.deviceId()).orElseThrow(() ->
                new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        // Lấy keycloakId để biết ai là chủ thùng rác
        String ownerId = device.getUserId() != null ? device.getUserId() : device.getTenantId();


        if (request.active() && device.getStatus() == DeviceStatus.OFFLINE) {
            device.setStatus(DeviceStatus.ONLINE);
            repository.save(device);

            // GỬI KAFKA EVENT: Thiết bị Online
            sendNotificationEvent(ownerId, "Device Online",
                    "Smart bin " + device.getName() + " is now back online.", NotificationType.DEVICE_ONLINE);

        } else if (!request.active() && device.getStatus() == DeviceStatus.ONLINE) {
            device.setStatus(DeviceStatus.OFFLINE);
            repository.save(device);

            // GỬI KAFKA EVENT: Thiết bị Offline
            sendNotificationEvent(ownerId, "Device Offline",
                    "Warning: Smart bin " + device.getName() + " has lost connection.", NotificationType.DEVICE_OFFLINE);
        }

        return "Status Processed";
    }

    @Transactional
    public String processDeviceAlarm(String signature, String payload) {
        String serverSignature = new HmacUtils("HmacSHA256", secretKey).hmacHex(payload);

        if(!serverSignature.equalsIgnoreCase(signature)){
            log.warn("Invalid signature for alarm webhook");
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Invalid signature");
        }

        try {
            JsonNode alarmNode = objectMapper.readTree(payload);
            String deviceIdStr = alarmNode.path("deviceId").asString();

            UUID deviceId;
            try {
                deviceId = UUID.fromString(deviceIdStr);
            } catch (IllegalArgumentException e) {
                throw new ApiException(DeviceErrorCode.INVALID_ID_FORMAT);
            }

            String alarmType = alarmNode.path("alarmType").asString();
            String severity = alarmNode.path("severity").asString();
            String status = alarmNode.path("status").asString();

            Device device = repository.findByIdAndActiveTrue(deviceId).orElseThrow(() ->
                    new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

            String ownerId = device.getUserId() != null ? device.getUserId() : device.getTenantId();

            if (status.startsWith("ACTIVE")) {
                String title = "Smart Bin Alarm: " + severity;
                String message = "Alarm '" + alarmType + "' was triggered for your bin: " + device.getName();

                // GỬI KAFKA EVENT: Báo động (Rác đầy, cháy nổ...)
                sendNotificationEvent(ownerId, title, message, NotificationType.SYSTEM_INFO);

                log.info("Processed active alarm for device {}: {}", deviceId, alarmType);
            } else if (status.startsWith("CLEARED")) {
                log.info("Alarm cleared for device {}: {}", deviceId, alarmType);
            }

            return "Alarm Processed Successfully";

        } catch (JacksonException ex){
            log.error("Failed to parse ThingsBoard alarm payload: {}", payload, ex);
            throw new ApiException(DeviceErrorCode.INVALID_PAYLOAD_FORMAT);
        }
    }

    // Hàm tiện ích để gói dữ liệu và đẩy lên Kafka sạch sẽ hơn
    private void sendNotificationEvent(String keycloakId, String title, String message, NotificationType type) {
        NotificationEventDto payload = new NotificationEventDto(
                keycloakId,
                title,
                message,
                type
        );

        kafkaService.publishNotification(payload);
//        kafkaTemplate.send("notification-events", eventPayload);
    }
}