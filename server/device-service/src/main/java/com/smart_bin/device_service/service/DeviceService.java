package com.smart_bin.device_service.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.nimbusds.jose.shaded.gson.JsonObject;
import com.smart_bin.core.common.Constants;
import com.smart_bin.core.common.NotificationType;
import com.smart_bin.core.dto.NotificationEventDto;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.device_service.common.DeviceState;
import com.smart_bin.device_service.common.DeviceStatus;
import com.smart_bin.device_service.config.MediaServiceClient;
import com.smart_bin.device_service.dto.request.AppVersionInfo;
import com.smart_bin.device_service.dto.request.CreateDeviceRequest;
import com.smart_bin.device_service.dto.request.UpdateDeviceRequest;
import com.smart_bin.device_service.dto.response.DetectionResultDto;
import com.smart_bin.device_service.dto.response.DeviceDto;
import com.smart_bin.device_service.entity.Device;
import com.smart_bin.device_service.entity.DeviceDetectionResult;
import com.smart_bin.device_service.exception.DeviceErrorCode;
import com.smart_bin.device_service.mapper.DeviceMapper;
import com.smart_bin.device_service.repository.DetectionResultRepository;
import com.smart_bin.device_service.repository.DeviceRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.redis.core.RedisTemplate;
// THÊM KAFKA
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class DeviceService {
    private final DeviceRepository repository;
    private final DeviceMapper mapper;
    private final ThingsBoardService thingsBoardService;
    private final DetectionResultRepository detectionRepository;
    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;
    private final MediaServiceClient mediaServiceClient;
    private final KafkaService kafkaService;
    private final DeviceSecurityService securityService;

    @Value("${media-service.internal-secret:SUPER_SECRET_INTERNAL_KEY}")
    private String internalSecret;

    @Value("${app.secret-key:SECRET_KEY_12345}")
    private String secretKey;

    @Transactional
    @CacheEvict(value = "device_list", key = "#keycloakId")
    public DeviceDto addDevice(CreateDeviceRequest request, String keycloakId) {
        // BỎ check User. Token có keycloakId là đủ quyền tạo thiết bị.
        Optional<Device> existingDeviceOpt = repository.findByMac(request.mac());
        Device device;

        if (existingDeviceOpt.isPresent()) {
            device = existingDeviceOpt.get();
            if (device.isActive()) {
                throw new ApiException(DeviceErrorCode.DEVICE_ALREADY_EXISTED);
            }
            log.info("Restoring soft-deleted device with MAC: {}", request.mac());
            device.setActive(true);
        } else {
            device = new Device();
            device.setMac(request.mac());
        }

        String tbDeviceName = "SmartBin-" + request.mac().replace(":", "").replace("-", "");
        JsonNode tbResponse = thingsBoardService.addDevice(tbDeviceName, "SmartBin");
        String tbDeviceId = tbResponse.get("id").get("id").asText();

        String displayName = (request.name() != null && !request.name().isBlank())
                ? request.name()
                : tbDeviceName;

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("macAddress", request.mac());
        attributes.put("longitude", request.longitude());
        attributes.put("latitude", request.latitude());
        attributes.put("name", displayName);

        thingsBoardService.updateAttributes(tbDeviceId, Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name(), attributes);

        JsonNode credentialResponse = thingsBoardService.getDeviceCredentials(tbDeviceId);
        String accessToken = credentialResponse.get("credentialsId").asText();

        device.setName(displayName);
        device.setLongitude(request.longitude());
        device.setLatitude(request.latitude());
        device.setDeviceId(tbDeviceId);
        device.setAccessToken(accessToken);
        device.setKeycloakId(keycloakId); // THAY THẾ: Lưu Khóa ngoại logic
        device.setState(DeviceState.PENDING);
        device.setStatus(DeviceStatus.OFFLINE);

        Device savedDevice = repository.save(device);

        String key = Constants.PENDING_DEVICE_PREFIX + keycloakId + ":" + savedDevice.getId();
        redisTemplate.opsForValue().set(key, "pending", Constants.TIMESTAMP_EXPIRY_20M, TimeUnit.MILLISECONDS);

        return mapper.toDto(savedDevice);
    }

    @Cacheable(value = "device_list", key = "#keycloakId")
    public List<DeviceDto> getListDevices(String keycloakId){
        // SỬA: Query thẳng bằng keycloakId
        List<Device> devices = repository.findByKeycloakIdAndActiveTrue(keycloakId);
        return devices.stream().map(mapper::toDto).collect(Collectors.toList());
    }

    @Cacheable(value = "device_detail", key = "#deviceId")
    public DeviceDto getDeviceDetail(String keycloakId, String deviceId){
        Device device = getDeviceAndVerifyOwnership(deviceId, keycloakId);
        return mapper.toDto(device);
    }

    @Transactional
    @Caching(
            put = { @CachePut(value = "device_detail", key = "#id") },
            evict = { @CacheEvict(value = "device_list", key = "#keycloakId") }
    )
    public DeviceDto updateDevice(String id, UpdateDeviceRequest request, String keycloakId) {
        Device device = getDeviceAndVerifyOwnership(id, keycloakId);
        Map<String, Object> tbAttributes = new HashMap<>();
        boolean isDbUpdated = false;

        if (request.name() != null && !request.name().isBlank()) {
            tbAttributes.put("name", request.name());
            device.setName(request.name());
            isDbUpdated = true;
        }

        if (request.latitude() != null) {
            tbAttributes.put("latitude", request.latitude());
            device.setLatitude(request.latitude());
            isDbUpdated = true;
        }

        if (request.longitude() != null) {
            tbAttributes.put("longitude", request.longitude());
            device.setLongitude(request.longitude());
            isDbUpdated = true;
        }

        if (request.additionalAttributes() != null && !request.additionalAttributes().isEmpty()) {
            tbAttributes.putAll(request.additionalAttributes());
        }

        if (!tbAttributes.isEmpty()) {
            String targetScope = Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name();
            if (request.scope() != null && !request.scope().isBlank()) {
                try {
                    targetScope = Constants.THINGSBOARD_SCOPE.valueOf(request.scope().toUpperCase()).name();
                } catch (IllegalArgumentException e) {
                    throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid ThingsBoard scope provided: " + request.scope());
                }
            }
            thingsBoardService.updateAttributes(device.getDeviceId(), targetScope, tbAttributes);
        }

        if (isDbUpdated) {
            device = repository.save(device);
        }

        return mapper.toDto(device);
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "device_detail", key = "#id"),
            @CacheEvict(value = "device_list", key = "#keycloakId")
    })
    public void deleteDevice(String id, String keycloakId){
        Device device = getDeviceAndVerifyOwnership(id, keycloakId);

        if (device.getDeviceId() != null) {
            thingsBoardService.deleteDevice(device.getDeviceId());
        }

        device.setActive(false);
        repository.save(device);

        NotificationEventDto payload = new NotificationEventDto(
                keycloakId,
                "Device Deleted",
                "The device " + device.getName() + " has been successfully removed.",
                NotificationType.DEVICE_DELETED
        );

        kafkaService.publishNotification(payload);
//        kafkaTemplate.send("notification-events", eventPayload);
    }

    @CacheEvict(value = "device_list", allEntries = true)
    public DeviceDto activateDevice(String payload){
        JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
        String mac = payloadObj.get("mac").getAsString();
        String publicKey = payloadObj.get("publicKey").getAsString();

        Device device = repository.findByMacAndActiveTrue(mac).orElseThrow(() ->
                new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        if (device.getState().equals(DeviceState.ACTIVE)){
            throw new ApiException(DeviceErrorCode.DEVICE_ALREADY_ACTIVATED);
        }

        device.setState(DeviceState.ACTIVE);
        device.setPublicKey(publicKey);
        Device savedDevice = repository.save(device);

        String key = Constants.PENDING_DEVICE_PREFIX + savedDevice.getKeycloakId() + ":" + savedDevice.getId();
        redisTemplate.delete(key);

        NotificationEventDto payloadNoti = new NotificationEventDto(
                savedDevice.getKeycloakId(),
                "Device Created",
                "Successfully provisioned new smart bin: " + device.getName(),
                NotificationType.DEVICE_CREATED
        );

        kafkaService.publishNotification(payloadNoti);

        return mapper.toDto(savedDevice);
    }

    public DeviceDto getAccessToken(String payload, String signature){
        JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
        String mac = payloadObj.get("mac").getAsString();

        Device device = repository.findByMacAndActiveTrue(mac).orElseThrow(() ->
                new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        securityService.verifySignatureWithDeviceKey(payload, signature, device.getPublicKey());

        if (device.getState() != DeviceState.ACTIVE){
            throw new ApiException(DeviceErrorCode.DEVICE_NOT_ACTIVE_YET);
        }
        return mapper.toDto(device);
    }

    public JsonNode getTelemetries(String id, String keycloakId, String keys, Long startTs, Long endTs) {
        Device device = getDeviceAndVerifyOwnership(id, keycloakId);
        return thingsBoardService.getTelemetries(device.getDeviceId(), keys, startTs, endTs);
    }

    public JsonNode getAttributes(String id, String keycloakId, String keys) {
        Device device = getDeviceAndVerifyOwnership(id, keycloakId);
        return thingsBoardService.getAttributes(device.getDeviceId(), keys);
    }

    @Transactional
    public String getPresignedUrl(String payload, String signature, String metadata) {
        try {
            DetectionResultDto fileInfo = objectMapper.readValue(metadata, DetectionResultDto.class);

            JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
            String mac = payloadObj.get("mac").getAsString();

            Device device = repository.findByMacAndActiveTrue(mac).orElseThrow(() ->
                    new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));


            securityService.verifySignatureWithDeviceKey(payload, signature, device.getPublicKey());

            JsonNode mediaResponse = mediaServiceClient.getInternalPresignedUrl(
                    internalSecret,
                    mac,
                    fileInfo.imageUrl(),
                    fileInfo.contentType()
            );

            String presignedUrl = mediaResponse.get("data").get("url").asText();
            String objectPath = mediaResponse.get("data").get("objectName").asText();

            Map<String, Object> redisData = new HashMap<>();
            redisData.put("metadata", fileInfo);
            redisData.put("objectPath", objectPath);

            String redisKey = Constants.PENDING_DETECTION_RESULT + mac + ":" + fileInfo.timestamp();

            redisTemplate.opsForValue().set(
                    redisKey,
                    objectMapper.writeValueAsString(redisData),
                    Constants.TIMESTAMP_EXPIRY_20M,
                    TimeUnit.MILLISECONDS
            );

            return presignedUrl;

        } catch (JacksonException e) {
            log.error("Lỗi parse metadata: {}", metadata, e);
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid metadata format");
        } catch (Exception e) {
            // Feign sẽ ném ra FeignException nếu HTTP status lỗi (ví dụ 403, 500)
            log.error("Lỗi khi gọi Media Service qua Feign: ", e);
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Cannot generate upload URL");
        }
    }

    @Transactional
    public String confirmUpload(String payload, String signature, String metadata){
        try {
            DetectionResultDto fileInfo = objectMapper.readValue(metadata, DetectionResultDto.class);

            JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
            String mac = payloadObj.get("mac").getAsString();

            Device device = repository.findByMacAndActiveTrue(mac)
                    .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

            securityService.verifySignatureWithDeviceKey(payload, signature, device.getPublicKey());

            DeviceDetectionResult result = new DeviceDetectionResult();
            result.setConfidence(fileInfo.confidence());
            result.setFeedback(fileInfo.feedback());
            result.setDevice(device);
            result.setType(fileInfo.type());
            // Frontend/Device sẽ truyền imageUrl tĩnh về đây
            result.setImageUrl(fileInfo.imageUrl());

            detectionRepository.save(result);

            return "Upload confirmed and saved.";
        } catch (JacksonException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid metadata structure");
        }
    }

    public Object getAppVersionInfo(String signature, String payload) {
//        JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
//        String mac = payloadObj.get("mac").getAsString();
//
//        Device device = repository.findByMacAndActiveTrue(mac).orElseThrow(() ->
//                new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));
//
//
//        securityService.verifySignatureWithDeviceKey(payload, signature, device.getPublicKey());

        String redisKey = com.smart_bin.device_service.common.Constants.APP_VERSION_PREFIX;

        String res = redisTemplate.opsForValue().get(redisKey);

        if (!StringUtils.hasText(res)) {
            return null;
        }

        return objectMapper.readValue(res, AppVersionInfo.class);

    }

    public Object updateAppVersionInfo(AppVersionInfo request, String key) {
        if (!key.equals(secretKey)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS);
        }

        String redisKey = com.smart_bin.device_service.common.Constants.APP_VERSION_PREFIX;
        String res = redisTemplate.opsForValue().get(redisKey);

        if (res != null && !res.isEmpty()) {
            AppVersionInfo info = objectMapper.readValue(res, AppVersionInfo.class);

            int binCompare = compareVersions(request.binVer(), info.binVer());
            int desktopCompare = compareVersions(request.desktopVer(), info.desktopVer());

            if (binCompare <= 0 && desktopCompare <= 0) {
                throw new ApiException(CoreErrorCode.BAD_REQUEST); // Hoặc mã lỗi tương ứng của bạn
            }
        }

        String newVersionData = objectMapper.writeValueAsString(request);
        redisTemplate.opsForValue().set(redisKey, newVersionData);

        return request;
    }

    private Device getDeviceAndVerifyOwnership(String deviceIdStr, String keycloakId) {
        UUID deviceId;
        try {
            deviceId = UUID.fromString(deviceIdStr);
        } catch (IllegalArgumentException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST);
        }

        Device device = repository.findByIdAndActiveTrue(deviceId)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        // CHỈNH SỬA: Check quyền bằng keycloakId thay vì User.getId()
        if (!device.getKeycloakId().equals(keycloakId)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS);
        }
        return device;
    }

    private int compareVersions(String v1, String v2) {
        if (v1 == null || v2 == null) return 0;

        String[] arr1 = v1.split("\\.");
        String[] arr2 = v2.split("\\.");

        int length = Math.max(arr1.length, arr2.length);
        for (int i = 0; i < length; i++) {
            // Nếu một version ngắn hơn (vd "1.0" so với "1.0.1"), phần thiếu sẽ coi như là 0
            int n1 = (i < arr1.length) ? Integer.parseInt(arr1[i]) : 0;
            int n2 = (i < arr2.length) ? Integer.parseInt(arr2[i]) : 0;

            if (n1 < n2) return -1;
            if (n1 > n2) return 1;
        }
        return 0; // Bằng nhau
    }
}