package com.smart_bin.device_service.service;

import com.smart_bin.core.common.EmailType;
import com.smart_bin.core.common.NotificationType;
import com.smart_bin.core.dto.EmailEventDto;
import com.smart_bin.core.dto.NotificationEventDto;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.device_service.common.DeviceStatus;
import com.smart_bin.device_service.config.IamServiceClient;
import com.smart_bin.device_service.dto.request.DeviceActivityWebhookRequest;
import com.smart_bin.device_service.entity.Device;
import com.smart_bin.device_service.exception.DeviceErrorCode;
import com.smart_bin.device_service.repository.DeviceRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.HashMap;
import java.util.Map;

@Service
@Slf4j
public class ThingsBoardService {

    private final RestClient restClient;
    private final IamServiceClient iamServiceClient;
    private final DeviceRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final KafkaService kafkaService;

    @Value("${things-board.key}")
    private String secretKey;

    @Value("${app.iam-service.internal-secret:SUPER_SECRET_INTERNAL_KEY}")
    private String internalSecret;

    public ThingsBoardService(
            @Qualifier("tbRestClient") RestClient restClient,
            DeviceRepository repository,
            KafkaService kafkaService,
            IamServiceClient iamServiceClient
    ) {
        this.restClient = restClient;
        this.repository = repository;
        this.kafkaService = kafkaService;
        this.iamServiceClient = iamServiceClient;
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

    public void assignProfileToDevice(String deviceId, String profileId) {
        ObjectNode deviceNode = restClient.get()
                .uri("/api/device/{deviceId}", deviceId)
                .retrieve()
                .body(ObjectNode.class);

        if (deviceNode != null) {
            JsonNode profileNode = deviceNode.get("deviceProfileId");

            if (profileNode != null && profileNode.isObject()) {
                ((ObjectNode) profileNode).put("id", profileId);
            } else {
                ObjectNode newProfileNode = deviceNode.putObject("deviceProfileId");
                newProfileNode.put("entityType", "DEVICE_PROFILE");
                newProfileNode.put("id", profileId);
            }
        }

        assert deviceNode != null;
        restClient.post()
                .uri("/api/device")
                .body(deviceNode)
                .retrieve()
                .body(ObjectNode.class);
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

    public JsonNode addDeviceProfile(String name, String description) {
        ObjectNode tbRequest = objectMapper.createObjectNode();

        tbRequest.put("name", name);
        if (description != null) {
            tbRequest.put("description", description);
        }

        tbRequest.put("type", "DEFAULT");
        tbRequest.put("transportType", "DEFAULT");
        tbRequest.put("provisionType", "DISABLED");

        ObjectNode profileData = tbRequest.putObject("profileData");
        profileData.putObject("configuration").put("type", "DEFAULT");
        profileData.putObject("transportConfiguration").put("type", "DEFAULT");
        profileData.putArray("alarms");

        return restClient.post()
                .uri("/api/deviceProfile")
                .body(tbRequest)
                .retrieve()
                .body(JsonNode.class);
    }

    public JsonNode getDeviceProfile(String profileId) {
        return restClient.get()
                .uri("/api/deviceProfile/{profileId}", profileId)
                .retrieve()
                .body(JsonNode.class);
    }

    public void deleteDeviceProfile(String profileId) {
        restClient.delete()
                .uri("/api/deviceProfile/{profileId}", profileId)
                .retrieve()
                .toBodilessEntity();

        log.info("Delete device profile on ThingsBoard successfully!");
    }

    public void configAlarmRules(String profileId, JsonNode alarmConfig) {
        ObjectNode profileNode = restClient.get()
                .uri("/api/deviceProfile/{profileId}", profileId)
                .retrieve()
                .body(ObjectNode.class);

        if (profileNode != null) {

            JsonNode profileDataNode = profileNode.get("profileData");

            if (profileDataNode != null && profileDataNode.isObject()) {
                ((ObjectNode) profileDataNode).set("alarms", alarmConfig);
            } else {
                ObjectNode newProfileData = profileNode.putObject("profileData");
                newProfileData.putObject("configuration").put("type", "DEFAULT");
                newProfileData.putObject("transportConfiguration").put("type", "DEFAULT");
                newProfileData.set("alarms", alarmConfig);
            }

            restClient.post()
                    .uri("/api/deviceProfile")
                    .body(profileNode)
                    .retrieve()
                    .toBodilessEntity();

            log.info("Configured alarm rules for device profile {} successfully!", profileId);
        } else {
            log.warn("Device Profile with id {} not found!", profileId);
        }
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

    public String processDeviceAlarm(String signature, String payload) {
//        String serverSignature = new HmacUtils("HmacSHA256", secretKey).hmacHex(payload);
//
//        if (!serverSignature.equalsIgnoreCase(signature)) {
//            log.warn("Invalid signature for alarm webhook");
//            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Invalid signature");
//        }

        try {
            JsonNode alarmNode = objectMapper.readTree(payload);

            JsonNode originatorNode = alarmNode.path("originator");
            String deviceIdStr = originatorNode.path("id").asString();

            if (deviceIdStr == null || deviceIdStr.isEmpty()) {
                log.error("Không tìm thấy originator.id trong webhook payload!");
                throw new ApiException(DeviceErrorCode.INVALID_PAYLOAD_FORMAT);
            }

            String alarmType = alarmNode.path("type").asString();

            String severity = alarmNode.path("severity").asString();
            String status = alarmNode.path("status").asString();

            Device device = repository.findByDeviceIdAndActiveTrue(deviceIdStr).orElseThrow(() ->
                    new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

            String userId = device.getUserId();
            String tenantId = device.getTenantId();

            if (status.startsWith("ACTIVE")) {
                String title = "Smart Bin Alarm: " + severity;
                String message = "Alarm '" + alarmType + "' was triggered for your bin: " + device.getName();

                boolean isNotified = false;

                if (StringUtils.hasText(userId)) {
                    sendNotificationEvent(userId, title, message, NotificationType.SYSTEM_INFO);
                    triggerAlarmEmail(userId, device.getName(), alarmType, severity); // GỌI HÀM GỬI EMAIL
                    isNotified = true;
                }

                if (StringUtils.hasText(tenantId) && !tenantId.equals(userId)) {
                    sendNotificationEvent(tenantId, title, message, NotificationType.SYSTEM_INFO);
                    triggerAlarmEmail(tenantId, device.getName(), alarmType, severity); // GỌI HÀM GỬI EMAIL
                    isNotified = true;
                }

                if (isNotified) {
                    log.info("Processed and sent notification for active alarm on device {}: {}", deviceIdStr, alarmType);
                } else {
                    log.warn("Alarm triggered for device {} but no owner/tenant found to notify.", deviceIdStr);
                }

            } else if (status.startsWith("CLEARED")) {
                log.info("Alarm cleared for device {}: {}", deviceIdStr, alarmType);
            }

            return "Alarm Processed Successfully";

        } catch (JacksonException ex) {
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

    private void triggerAlarmEmail(String ownerId, String deviceName, String alarmType, String severity) {
        try {
             var userResponse = iamServiceClient.getUserById(ownerId, internalSecret);
             String email = userResponse.get("data").get("email").asString();
             String fullName = userResponse.get("data").get("name").asString();

            if (StringUtils.hasText(email)) {
                Map<String, Object> data = new HashMap<>();
                data.put("email", email);
                data.put("fullName", fullName);
                data.put("deviceName", deviceName);
                data.put("alarmType", alarmType);
                data.put("severity", severity);

                EmailEventDto emailEvent = new EmailEventDto(EmailType.ALARM_TRIGGERED, data);
                kafkaService.publishEmailEvent(emailEvent);
            }
        } catch (Exception e) {
            log.error("Lỗi khi chuẩn bị gửi email cảnh báo cho {}: {}", ownerId, e.getMessage());
        }
    }
}