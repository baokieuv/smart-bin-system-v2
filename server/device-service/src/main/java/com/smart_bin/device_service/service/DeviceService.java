package com.smart_bin.device_service.service;

import com.nimbusds.jose.shaded.gson.JsonObject;
import com.smart_bin.core.common.Constants;
import com.smart_bin.core.common.NotificationType;
import com.smart_bin.core.dto.NotificationEventDto;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.device_service.common.DeviceState;
import com.smart_bin.device_service.common.DeviceStatus;
import com.smart_bin.device_service.config.MediaServiceClient;
import com.smart_bin.device_service.dto.request.CreateDeviceRequest;
import com.smart_bin.device_service.dto.request.DeviceImportItem;
import com.smart_bin.device_service.dto.request.ImportDeviceRequest;
import com.smart_bin.device_service.dto.request.UpdateDeviceRequest;
import com.smart_bin.device_service.dto.response.DetectionResultDto;
import com.smart_bin.device_service.dto.response.DeviceDto;
import com.smart_bin.device_service.entity.Device;
import com.smart_bin.device_service.entity.DeviceDetectionResult;
import com.smart_bin.device_service.entity.DeviceGroup;
import com.smart_bin.device_service.exception.DeviceErrorCode;
import com.smart_bin.device_service.mapper.DeviceMapper;
import com.smart_bin.device_service.repository.DetectionResultRepository;
import com.smart_bin.device_service.repository.DeviceGroupRepository;
import com.smart_bin.device_service.repository.DeviceRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.RedisTemplate;
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
    private final DeviceGroupRepository groupRepository;

    @Value("${media-service.internal-secret:SUPER_SECRET_INTERNAL_KEY}")
    private String internalSecret;

    @Transactional
    @CacheEvict(value = "device_list", allEntries = true)
    public List<DeviceDto> importDevices(ImportDeviceRequest request, String actorId) {
        List<Device> devicesToSave = new ArrayList<>();

        Set<String> macsToImport = request.devices().stream()
                .map(DeviceImportItem::mac)
                .collect(Collectors.toSet());

        Set<String> existingMacs = repository.findByMacIn(macsToImport).stream()
                .map(Device::getMac)
                .collect(Collectors.toSet());

        Set<String> groupCodes = request.devices().stream()
                .map(DeviceImportItem::groupCode)
                .filter(code -> code != null && !code.isBlank())
                .collect(Collectors.toSet());

        Map<String, DeviceGroup> groupMap = new HashMap<>();
        if (!groupCodes.isEmpty()) {
            List<DeviceGroup> fetchedGroups = groupRepository.findByCodeIn(groupCodes);
            for (DeviceGroup group : fetchedGroups) {
                groupMap.put(group.getCode(), group);
            }

            // Kiểm tra xem có groupCode nào truyền lên mà không tồn tại trong DB không
            for (String code : groupCodes) {
                if (!groupMap.containsKey(code)) {
                    throw new ApiException(CoreErrorCode.BAD_REQUEST, "Không tìm thấy Device Group với code: " + code);
                }
            }
        }

        for (DeviceImportItem item : request.devices()) {
            // Tra cứu MAC với O(1)
            if (existingMacs.contains(item.mac())) {
                log.warn("Bỏ qua thiết bị có MAC {} vì đã tồn tại trong hệ thống.", item.mac());
                continue;
            }

            // Tra cứu Group với O(1)
            DeviceGroup group = null;
            if (item.groupCode() != null && !item.groupCode().isBlank()) {
                group = groupMap.get(item.groupCode());
            }

            // Giao tiếp với ThingsBoard (Vẫn phải gọi HTTP Call từng cái do API ThingsBoard)
            String tbDeviceName = "SmartBin-" + item.mac().replace(":", "").replace("-", "");
            JsonNode tbResponse = thingsBoardService.addDevice(tbDeviceName, "SmartBin");
            String tbDeviceId = tbResponse.get("id").get("id").asText();

            String displayName = (item.name() != null && !item.name().isBlank()) ? item.name() : tbDeviceName;

            Map<String, Object> attributes = new HashMap<>();
            attributes.put("macAddress", item.mac());
            attributes.put("name", displayName);
            thingsBoardService.updateAttributes(tbDeviceId, Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name(), attributes);

            JsonNode credentialResponse = thingsBoardService.getDeviceCredentials(tbDeviceId);
            String accessToken = credentialResponse.get("credentialsId").asText();

            Device device = new Device();
            device.setKeycloakId(actorId);
            device.setMac(item.mac());
            device.setName(displayName);
            device.setDeviceId(tbDeviceId);
            device.setAccessToken(accessToken);
            device.setActive(false);
            device.setState(DeviceState.PENDING);
            device.setStatus(DeviceStatus.OFFLINE);
            device.setClaimedAt(null);
            device.setDeviceGroup(group);

            devicesToSave.add(device);
        }

        if (!devicesToSave.isEmpty()) {
            devicesToSave = repository.saveAll(devicesToSave);
        }

        return devicesToSave.stream().map(mapper::toDto).collect(Collectors.toList());
    }

    @Transactional
    @CacheEvict(value = "device_list", key = "#keycloakId")
    public DeviceDto addDevice(CreateDeviceRequest request, String keycloakId) {
        Device device = repository.findByMac(request.mac())
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND, "Thiết bị chưa được đăng ký vào hệ thống bởi nhà sản xuất."));

        if (device.isActive() || (device.getKeycloakId() != null)) {
            throw new ApiException(DeviceErrorCode.DEVICE_ALREADY_EXISTED, "Thiết bị này đã được liên kết với một tài khoản khác.");
        }

        String displayName = (request.name() != null && !request.name().isBlank())
                ? request.name()
                : device.getName();

        device.setName(displayName);
        device.setLongitude(request.longitude());
        device.setLatitude(request.latitude());
        device.setKeycloakId(keycloakId);
        device.setActive(true);
        device.setState(DeviceState.PENDING);
        device.setClaimedAt(System.currentTimeMillis());

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("macAddress", request.mac());
        attributes.put("longitude", request.longitude());
        attributes.put("latitude", request.latitude());
        attributes.put("name", displayName);
        thingsBoardService.updateAttributes(device.getDeviceId(), Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name(), attributes);

        Device savedDevice = repository.save(device);

        String key = Constants.PENDING_DEVICE_PREFIX + keycloakId + ":" + savedDevice.getId();
        redisTemplate.opsForValue().set(key, "pending", Constants.TIMESTAMP_EXPIRY_20M, TimeUnit.MILLISECONDS);

        return mapper.toDto(savedDevice);
    }

    @Cacheable(value = "device_list", key = "#keycloakId + '-' + #page + '-' + #size")
    public Page<DeviceDto> getListDevices(String keycloakId, int page, int size) {
        int pageIndex = (page > 0) ? page - 1 : 0;
        int pageSize = (size > 0) ? size : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        Page<Device> devices = repository.findByKeycloakIdAndActiveTrue(keycloakId, pageable);
        return devices.map(mapper::toDto);
    }

    public Page<DeviceDto> getAllDevicesForAdmin(int page, int size) {
        int pageIndex = (page > 0) ? page - 1 : 0;
        int pageSize = (size > 0) ? size : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        // Lấy toàn bộ thiết bị (kể cả chưa active/lưu kho)
        Page<Device> devices = repository.findAllForAdminWithConfig(pageable);
        return devices.map(mapper::toDto);
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

        // Chuyển thiết bị về trạng thái lưu kho, KHÔNG xóa trên ThingsBoard
        device.setActive(false);
        device.setKeycloakId(null);
        device.setState(DeviceState.PENDING);
        device.setClaimedAt(null);
        repository.save(device);

        String redisKey = Constants.PENDING_DEVICE_PREFIX + keycloakId + ":" + device.getId();
        redisTemplate.delete(redisKey);

        NotificationEventDto payload = new NotificationEventDto(
                keycloakId,
                "Device Deleted",
                "The device " + device.getName() + " has been successfully unbinded from your account.",
                NotificationType.DEVICE_DELETED
        );

        kafkaService.publishNotification(payload);
    }

    @CacheEvict(value = "device_list", allEntries = true)
    public DeviceDto activateDevice(String payload, String desktopVer, String binVer){
        JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
        String mac = payloadObj.get("mac").getAsString();
        String publicKey = payloadObj.get("publicKey").getAsString();

        Device device = repository.findByMacAndActiveTrue(mac).orElseThrow(() ->
                new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND, "Thiết bị chưa được người dùng thêm vào tài khoản."));

        if (device.getState() == DeviceState.ACTIVE){
            throw new ApiException(DeviceErrorCode.DEVICE_ALREADY_ACTIVATED);
        }

        if (device.getState() != DeviceState.PENDING) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Trạng thái thiết bị không hợp lệ để kích hoạt.");
        }

        device.setState(DeviceState.ACTIVE);
        device.setPublicKey(publicKey);
        updateVersionInfo(device, desktopVer, binVer);

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

    @Transactional
    public DeviceDto getAccessToken(String payload, String signature, String desktopVer, String binVer){
        JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
        String mac = payloadObj.get("mac").getAsString();

        Device device = repository.findByMacAndActiveTrue(mac).orElseThrow(() ->
                new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        securityService.verifySignatureWithDeviceKey(payload, signature, device.getPublicKey());

        if (device.getState() != DeviceState.ACTIVE){
            throw new ApiException(DeviceErrorCode.DEVICE_NOT_ACTIVE_YET);
        }

        updateVersionInfo(device, desktopVer, binVer);
        repository.save(device);

        return mapper.toDto(device);
    }

    public JsonNode getTelemetries(String id, String keycloakId, String keys, Long startTs, Long endTs) {
        Device device = getDeviceAndVerifyOwnership(id, keycloakId);

        // Bảo mật: Nếu startTs cũ hơn lúc nhận máy, ép về mốc claimedAt
        if (device.getClaimedAt() != null) {
            if (startTs == null || startTs < device.getClaimedAt()) {
                startTs = device.getClaimedAt();
            }
        }

        return thingsBoardService.getTelemetries(device.getDeviceId(), keys, startTs, endTs);
    }

    public JsonNode getAttributes(String id, String keycloakId, String keys) {
        Device device = getDeviceAndVerifyOwnership(id, keycloakId);
        return thingsBoardService.getAttributes(device.getDeviceId(), keys);
    }

    @Transactional
    public String getPresignedUrl(String payload, String signature, String metadata, String desktopVer, String binVer) {
        try {
            DetectionResultDto fileInfo = objectMapper.readValue(metadata, DetectionResultDto.class);

            JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
            String mac = payloadObj.get("mac").getAsString();

            Device device = repository.findByMacAndActiveTrue(mac).orElseThrow(() ->
                    new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

            securityService.verifySignatureWithDeviceKey(payload, signature, device.getPublicKey());

            updateVersionInfo(device, desktopVer, binVer);
            repository.save(device);

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
            log.error("Lỗi khi gọi Media Service qua Feign: ", e);
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Cannot generate upload URL");
        }
    }

    @Transactional
    public String confirmUpload(String payload, String signature, String metadata, String desktopVer, String binVer){
        try {
            DetectionResultDto fileInfo = objectMapper.readValue(metadata, DetectionResultDto.class);

            JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
            String mac = payloadObj.get("mac").getAsString();

            Device device = repository.findByMacAndActiveTrue(mac)
                    .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

            securityService.verifySignatureWithDeviceKey(payload, signature, device.getPublicKey());

            updateVersionInfo(device, desktopVer, binVer);

            DeviceDetectionResult result = new DeviceDetectionResult();
            result.setConfidence(fileInfo.confidence());
            result.setFeedback(fileInfo.feedback());
            result.setDevice(device);
            result.setType(fileInfo.type());
            result.setImageUrl(fileInfo.imageUrl());

            detectionRepository.save(result);
            repository.save(device);

            return "Upload confirmed and saved.";
        } catch (JacksonException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid metadata structure");
        }
    }

    private void updateVersionInfo(Device device, String desktopVer, String binVer) {
        if (StringUtils.hasText(desktopVer)) {
            device.setDesktopVersion(desktopVer);
        }
        if (StringUtils.hasText(binVer)) {
            device.setBinVersion(binVer);
        }
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
            int n1 = (i < arr1.length) ? Integer.parseInt(arr1[i]) : 0;
            int n2 = (i < arr2.length) ? Integer.parseInt(arr2[i]) : 0;

            if (n1 < n2) return -1;
            if (n1 > n2) return 1;
        }
        return 0;
    }
}