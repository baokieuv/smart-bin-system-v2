package com.smart_bin.device_service.service;

import com.nimbusds.jose.shaded.gson.JsonObject;
import com.smart_bin.core.common.Constants;
import com.smart_bin.core.common.NotificationType;
import com.smart_bin.core.dto.NotificationEventDto;
import com.smart_bin.core.dto.PageResponseDto;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.device_service.common.DetectionFeedback;
import com.smart_bin.device_service.common.DeviceState;
import com.smart_bin.device_service.common.DeviceStatus;
import com.smart_bin.device_service.common.WasteType;
import com.smart_bin.device_service.config.MediaServiceClient;
import com.smart_bin.device_service.dto.request.*;
import com.smart_bin.device_service.dto.response.DetectionResultDto;
import com.smart_bin.device_service.dto.response.DeviceDto;
import com.smart_bin.device_service.dto.response.DeviceProvisionResponse;
import com.smart_bin.device_service.entity.*;
import com.smart_bin.device_service.exception.DeviceErrorCode;
import com.smart_bin.device_service.mapper.DeviceMapper;
import com.smart_bin.device_service.repository.*;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.codec.digest.DigestUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.*;
import java.util.concurrent.TimeUnit;

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
    private final DeviceProfileRepository profileRepository;
    private final DeviceGroupRepository groupRepository;
    private final FirmwareMappingRepository mappingRepository;

    private static final String CLAIM_CACHE_PREFIX = "claim:mac:";

    @Value("${app.media-service.internal-secret:SUPER_SECRET_INTERNAL_KEY}")
    private String internalSecret;

    @Value("${app.secret-key:DEFAULT_CLAIM_SECRET_KEY}")
    private String claimSecret;

    @Transactional
    public String claimDevice(ClaimDeviceRequest request, String userId) {
        String expectedCode = DigestUtils.sha256Hex(request.mac() + claimSecret).substring(0, 6).toUpperCase();

        if (request.claimCode() == null || !request.claimCode().toUpperCase().equals(expectedCode)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Claim code không hợp lệ.");
        }

        Optional<Device> deviceOpt = repository.findByMac(request.mac());

        return deviceOpt.map(device -> claimExistingDevice(device, request, userId))
                .orElseGet(() -> cacheClaimRequestForFutureProvision(request, userId));
    }

//    @Cacheable(value = "device_list", key = "#keycloakId + ':' + #page + ':' + #size")
    public PageResponseDto<DeviceDto> getListDevices(String keycloakId, int page, int size) {
        int pageIndex = (page > 0) ? page - 1 : 0;
        int pageSize = (size > 0) ? size : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        Page<Device> devices = repository.findByUserIdAndActiveTrue(keycloakId, pageable);

        Page<DeviceDto> dtoPage = devices.map(mapper::toDto);

        return new PageResponseDto<>(dtoPage);
    }

    public Page<DeviceDto> getAllDevicesForAdmin(int page, int size, String actorId, boolean isSuperAdmin) {
        int pageIndex = (page > 0) ? page - 1 : 0;
        int pageSize = (size > 0) ? size : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        Page<Device> devices;

        if (isSuperAdmin) {
            // Nếu là SUPER_ADMIN -> Lấy toàn bộ thiết bị trên hệ thống
            devices = repository.findAllForAdminWithConfig(pageable);
        } else {
            // Nếu chỉ là ADMIN (Tenant) -> Chỉ lấy thiết bị do Tenant này sở hữu
            devices = repository.findAllByTenantIdForAdminWithConfig(actorId, pageable);
        }

        return devices.map(mapper::toDto);
    }

//    @Cacheable(value = "device_detail", key = "#keycloakId + ':' + #deviceId")
    public DeviceDto getDeviceDetail(String keycloakId, String deviceId){
        Device device = getDeviceAndVerifyUserOwnership(deviceId, keycloakId);
        return mapper.toDto(device);
    }

    @Transactional
    @Caching(
            put = { @CachePut(value = "device_detail", key = "#keycloakId + ':' + #id") },
            evict = { @CacheEvict(value = "device_list", allEntries = true) }
    )
    public DeviceDto updateDeviceByUser(String id, UpdateDeviceUserRequest request, String keycloakId) {
        Device device = getDeviceAndVerifyUserOwnership(id, keycloakId);
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

        if (request.pollingInterval() != null || request.fullThreshold() != null) {
            Map<String, Object> currentConfigs = device.getUserConfigs();
            if (currentConfigs == null) {
                currentConfigs = new HashMap<>();
            }

            if (request.pollingInterval() != null) {
                currentConfigs.put("polling_interval", request.pollingInterval());
            }
            if (request.fullThreshold() != null) {
                currentConfigs.put("full_threshold", request.fullThreshold());
            }

            device.setUserConfigs(currentConfigs);
            isDbUpdated = true;
        }

        if (!tbAttributes.isEmpty()) {
            thingsBoardService.updateAttributes(device.getDeviceId(), Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name(), tbAttributes);
        }

        if (isDbUpdated) {
            device = repository.save(device);
        }

        return mapper.toDto(device);
    }

    @Transactional
    @Caching(
            put = { @CachePut(value = "device_detail", key = "#tenantId + ':' + #id") },
            evict = { @CacheEvict(value = "device_list", allEntries = true) }
    )
    public DeviceDto updateDeviceByTenant(String id, UpdateDeviceTenantRequest request, String tenantId) {
        Device device = getDeviceAndVerifyTenantOwnership(id, tenantId);

        if (request.groupId() != null) {
            if (request.groupId().trim().isEmpty()) {
                device.setDeviceGroup(null);
            } else {
                try {
                    UUID groupId = UUID.fromString(request.groupId());
                    DeviceGroup group = groupRepository.findByIdAndTenantIdAndActiveTrue(groupId, tenantId)
                            .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Nhóm thiết bị không tồn tại hoặc bạn không có quyền truy cập."));

                    device.setDeviceGroup(group);
                } catch (IllegalArgumentException e) {
                    throw new ApiException(CoreErrorCode.BAD_REQUEST, "Định dạng Group ID không hợp lệ");
                }
            }
            device = repository.save(device);
        }

        return mapper.toDto(device);
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "device_detail", key = "#keycloakId + ':' + #id"),
            @CacheEvict(value = "device_list", allEntries = true)
    })
    public void deleteDevice(String id, String keycloakId){
        Device device = getDeviceAndVerifyUserOwnership(id, keycloakId);

        // Chuyển thiết bị về trạng thái lưu kho, KHÔNG xóa trên ThingsBoard
        device.setActive(false);
        device.setUserId(null);
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

    @Transactional
    public Object provisionDevice(String payload, String signature) {
        DeviceProvisionRequest request;
        try {
            request = objectMapper.readValue(payload, DeviceProvisionRequest.class);
        } catch (JacksonException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid payload format");
        }

        Optional<Device> existingDeviceOpt = repository.findByMac(request.mac());
        String deviceSecret;

        if (existingDeviceOpt.isPresent() && existingDeviceOpt.get().getPublicKey() != null) {
            deviceSecret = existingDeviceOpt.get().getPublicKey();
        } else {
            deviceSecret = securityService.generateDeviceSecret(request.mac());
        }

        securityService.verifySignatureWithDeviceKey(payload, signature, deviceSecret);

        DeviceProfile profile = profileRepository.findByCodeAndActiveTrue(request.profileCode())
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Mã mẫu thiết bị (Profile Code) không hợp lệ hoặc không tồn tại."));

        boolean isNewDevice = existingDeviceOpt.isEmpty();

        Device device = isNewDevice
                ? initializeNewDevice(request, profile)
                : resetExistingDeviceForProvision(existingDeviceOpt.get(), request, profile);

        device.setPublicKey(deviceSecret);

        processCachedClaimData(device, request.mac());

        syncWithThingsBoard(device, isNewDevice, request.mac());

        // 4. Tự động tìm và gán Firmware dựa trên hw_metadata
        autoAssignFirmware(device);

        Device savedDevice = repository.save(device);

        // 5. Nếu là máy mới (chưa có Config) thì tạo Default Config
        if (device.getUserConfigs() == null) {
            device.setUserConfigs(Map.of(
                    "polling_interval", 300,
                    "full_threshold", 80.0
            ));
        }

        // 6. Trả về Token và ID cho phần cứng
        return new DeviceProvisionResponse(
                savedDevice.getId().toString(),
                savedDevice.getDeviceId(),
                savedDevice.getAccessToken(),
                "Thiết bị kích hoạt thành công!"
        );
    }

    public JsonNode getTelemetries(String id, String keycloakId, String keys, Long startTs, Long endTs) {
        Device device = getDeviceAndVerifyUserOwnership(id, keycloakId);

        // Bảo mật: Nếu startTs cũ hơn lúc nhận máy, ép về mốc claimedAt
        if (device.getClaimedAt() != null) {
            if (startTs == null || startTs < device.getClaimedAt()) {
                startTs = device.getClaimedAt();
            }
        }

        return thingsBoardService.getTelemetries(device.getDeviceId(), keys, startTs, endTs);
    }

    @Transactional
    public String getPresignedUrl(String payload, String signature, String metadata, String desktopVer, String binVer) {
        DetectionResultDto fileInfo = parseMetadata(metadata);
        Device device = verifyDeviceSignatureAndMetadata(payload, signature, desktopVer, binVer);

        JsonNode mediaResponse = mediaServiceClient.getInternalPresignedUrl(
                internalSecret, device.getMac(), fileInfo.filename(), fileInfo.contentType()
        );

        String objectPath = mediaResponse.get("data").get("objectName").asString();
        cachePendingDetectionUpload(device.getMac(), fileInfo, objectPath);

        return mediaResponse.get("data").get("url").asString();
    }

    @Transactional
    public String confirmUpload(String payload, String signature, String metadata, String desktopVer, String binVer) {
        DetectionResultDto fileInfo = parseMetadata(metadata);
        Device device = verifyDeviceSignatureAndMetadata(payload, signature, desktopVer, binVer);

        String finalImageUrl = extractCachedImageUrlAndClear(device.getMac(), fileInfo.detectionId());
        saveDetectionResult(device, fileInfo, finalImageUrl);

        return "Upload confirmed and saved.";
    }

    private Device initializeNewDevice(DeviceProvisionRequest request, DeviceProfile profile) {
        Device device = new Device();
        device.setMac(request.mac());
        device.setHwMetadata(request.hwMetadata());
        device.setState(DeviceState.ACTIVE);
        device.setStatus(DeviceStatus.OFFLINE);
        device.setDeviceProfile(profile);
        return device;
    }

    private Device resetExistingDeviceForProvision(Device device, DeviceProvisionRequest request, DeviceProfile profile) {
        if (device.getPublicKey() != null && device.getState() == DeviceState.ACTIVE) {
            throw new ApiException(DeviceErrorCode.DEVICE_ALREADY_ACTIVATED, "Thiết bị này đã được kích hoạt trước đó.");
        }
        device.setHwMetadata(request.hwMetadata());
        device.setState(DeviceState.ACTIVE);
        device.setStatus(DeviceStatus.OFFLINE);
        device.setDeviceProfile(profile);
        return device;
    }

    private void processCachedClaimData(Device device, String mac) {
        String cacheKey = CLAIM_CACHE_PREFIX + mac;
        String cachedDataStr = redisTemplate.opsForValue().get(cacheKey);

        if (cachedDataStr != null && device.getUserId() == null) {
            try {
                JsonNode cachedData = objectMapper.readTree(cachedDataStr);
                if (cachedData.has("userId")) device.setUserId(cachedData.get("userId").asString());
                if (cachedData.has("name")) device.setName(cachedData.get("name").asString());
                if (cachedData.has("latitude")) device.setLatitude(cachedData.get("latitude").asDouble());
                if (cachedData.has("longitude")) device.setLongitude(cachedData.get("longitude").asDouble());

                device.setClaimedAt(System.currentTimeMillis());
                redisTemplate.delete(cacheKey);
                log.info("Auto-mapped User {} và tọa độ cho thiết bị MAC {}", device.getUserId(), mac);
            } catch (Exception e) {
                log.error("Lỗi khi đọc cache claim data: ", e);
            }
        }
    }

    private void syncWithThingsBoard(Device device, boolean isNewDevice, String mac) {
        Map<String, Object> attributes = new HashMap<>();

        if (isNewDevice) {
            String defaultName = "SmartBin-" + mac.replace(":", "").replace("-", "");
            if (device.getName() == null || device.getName().isBlank()) {
                device.setName(defaultName);
            }

            JsonNode tbResponse = thingsBoardService.addDevice(device.getName(), "SmartBin");
            String tbDeviceId = tbResponse.get("id").get("id").asString();

            attributes.put("macAddress", mac);
            attributes.put("name", device.getName());
            if (device.getLatitude() != null) attributes.put("latitude", device.getLatitude());
            if (device.getLongitude() != null) attributes.put("longitude", device.getLongitude());

            thingsBoardService.updateAttributes(tbDeviceId, Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name(), attributes);

            JsonNode credentialResponse = thingsBoardService.getDeviceCredentials(tbDeviceId);
            String accessToken = credentialResponse.get("credentialsId").asString();

            device.setDeviceId(tbDeviceId);
            device.setAccessToken(accessToken);
        } else {
            if (device.getName() != null) attributes.put("name", device.getName());
            if (device.getLatitude() != null) attributes.put("latitude", device.getLatitude());
            if (device.getLongitude() != null) attributes.put("longitude", device.getLongitude());

            if (!attributes.isEmpty() && device.getDeviceId() != null) {
                thingsBoardService.updateAttributes(device.getDeviceId(), Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name(), attributes);
            }
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

    private Device getDeviceAndVerifyUserOwnership(String deviceIdStr, String userId) {
        UUID deviceId = parseUUID(deviceIdStr);
        Device device = repository.findByIdAndActiveTrue(deviceId)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        // Kiểm tra quyền của Normal User
        if (device.getUserId() == null || !device.getUserId().equals(userId)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Bạn không phải chủ sở hữu thiết bị này");
        }
        return device;
    }

    private Device getDeviceAndVerifyTenantOwnership(String deviceIdStr, String tenantId) {
        UUID deviceId = parseUUID(deviceIdStr);
        Device device = repository.findByIdAndActiveTrue(deviceId)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        // Kiểm tra quyền của Tenant
        if (device.getTenantId() == null || !device.getTenantId().equals(tenantId)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Thiết bị này không thuộc quyền quản lý của tổ chức bạn");
        }
        return device;
    }

    private UUID parseUUID(String id) {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid ID format");
        }
    }

    private void autoAssignFirmware(Device device) {
        // Lấy tất cả các rule đang active, sắp xếp theo Priority giảm dần
        List<FirmwareMapping> rules = mappingRepository.findAllByActiveTrueOrderByPriorityDesc();
        Map<String, Object> deviceMeta = device.getHwMetadata();

        for (FirmwareMapping rule : rules) {
            if (isMetadataMatched(deviceMeta, rule.getMetadataCriteria())) {
                // Tùy theo logic của bạn gán vào Bin hay Desktop, ở đây ví dụ gán vào Bin
                device.setTargetBinFirmware(rule.getTargetFirmware());
                log.info("Device MAC {} matched Firmware Rule ID {}", device.getMac(), rule.getId());
                return; // Khớp rule đầu tiên (ưu tiên cao nhất) thì dừng
            }
        }
        log.warn("Không tìm thấy Firmware phù hợp cho Device MAC {}", device.getMac());
    }

    private boolean isMetadataMatched(Map<String, Object> deviceMeta, Map<String, Object> ruleCriteria) {
        if (ruleCriteria == null || ruleCriteria.isEmpty()) return false;

        for (Map.Entry<String, Object> entry : ruleCriteria.entrySet()) {
            if (!deviceMeta.containsKey(entry.getKey())) return false;
            if (!deviceMeta.get(entry.getKey()).equals(entry.getValue())) return false;
        }
        return true;
    }

    private String claimExistingDevice(Device device, ClaimDeviceRequest request, String userId) {
        if (device.getUserId() != null) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Thiết bị này đã được liên kết với một tài khoản khác.");
        }
        device.setUserId(userId);
        device.setClaimedAt(System.currentTimeMillis());

        Map<String, Object> tbAttributes = new HashMap<>();
        if (StringUtils.hasText(request.name())) {
            device.setName(request.name());
            tbAttributes.put("name", request.name());
        }
        if (request.latitude() != null) {
            device.setLatitude(request.latitude());
            tbAttributes.put("latitude", request.latitude());
        }
        if (request.longitude() != null) {
            device.setLongitude(request.longitude());
            tbAttributes.put("longitude", request.longitude());
        }

        if (!tbAttributes.isEmpty() && device.getDeviceId() != null) {
            thingsBoardService.updateAttributes(device.getDeviceId(), Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name(), tbAttributes);
        }

        repository.save(device);
        return "Đã liên kết thiết bị thành công!";
    }

    private String cacheClaimRequestForFutureProvision(ClaimDeviceRequest request, String userId) {
        String cacheKey = CLAIM_CACHE_PREFIX + request.mac();
        try {
            Map<String, Object> cacheData = new HashMap<>();
            cacheData.put("userId", userId);
            if (StringUtils.hasText(request.name())) cacheData.put("name", request.name());
            if (request.latitude() != null) cacheData.put("latitude", request.latitude());
            if (request.longitude() != null) cacheData.put("longitude", request.longitude());

            redisTemplate.opsForValue().set(cacheKey, objectMapper.writeValueAsString(cacheData), 7, TimeUnit.DAYS);
            return "Đã ghi nhận yêu cầu. Thiết bị sẽ liên kết khi cắm điện.";
        } catch (Exception e) {
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Lỗi khi lưu thông tin thiết bị.");
        }
    }

    private DetectionResultDto parseMetadata(String metadata) {
        try {
            return objectMapper.readValue(metadata, DetectionResultDto.class);
        } catch (JacksonException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid metadata format");
        }
    }

    private Device verifyDeviceSignatureAndMetadata(String payload, String signature, String desktopVer, String binVer) {
        JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
        String mac = payloadObj.get("mac").getAsString();

        Device device = repository.findByMacAndActiveTrue(mac)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        securityService.verifySignatureWithDeviceKey(payload, signature, device.getPublicKey());
        updateVersionInfo(device, desktopVer, binVer);
        return repository.save(device);
    }

    private void cachePendingDetectionUpload(String mac, DetectionResultDto fileInfo, String objectPath) {
        try {
            Map<String, Object> redisData = Map.of("metadata", fileInfo, "objectPath", objectPath);
            String redisKey = Constants.PENDING_DETECTION_RESULT + mac + ":" + fileInfo.detectionId();
            redisTemplate.opsForValue().set(redisKey, objectMapper.writeValueAsString(redisData), Constants.TIMESTAMP_EXPIRY_20M, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            log.error("Lỗi khi serialize redis data", e);
        }
    }

    private String extractCachedImageUrlAndClear(String mac, String detectionId) {
        String redisKey = Constants.PENDING_DETECTION_RESULT + mac + ":" + detectionId;
        String cachedData = redisTemplate.opsForValue().get(redisKey);
        redisTemplate.delete(redisKey);

        if (cachedData != null) {
            try {
                return objectMapper.readTree(cachedData).get("objectPath").asString();
            } catch (Exception ignored) {}
        }
        return null;
    }

    private void saveDetectionResult(Device device, DetectionResultDto fileInfo, String finalImageUrl) {
        DeviceDetectionResult result = new DeviceDetectionResult();
        result.setDevice(device);
        result.setConfidence(fileInfo.confidence());
        result.setImageUrl(finalImageUrl);

        if (StringUtils.hasText(fileInfo.category())) result.setType(WasteType.valueOf(fileInfo.category().toUpperCase()));
        if (StringUtils.hasText(fileInfo.userFeedback())) result.setFeedback(DetectionFeedback.valueOf(fileInfo.userFeedback().toUpperCase()));
        if (fileInfo.detectedAt() != null) {
            result.setDetectedAt(java.time.OffsetDateTime.parse(fileInfo.detectedAt()).toInstant().toEpochMilli());
        }
        detectionRepository.save(result);
    }

    @Async
    @Transactional
    public void applyFirmwareMappingToExistingDevices(FirmwareMapping rule) {
        log.info("Bắt đầu Job ngầm gán Firmware {} cho các thiết bị khớp rule...", rule.getTargetFirmware().getVersion());

        int page = 0;
        int size = 500; // Xử lý từng lô 500 thiết bị
        Page<Device> devicePage;

        do {
            devicePage = repository.findAll(PageRequest.of(page, size));
            List<Device> devicesToUpdate = new ArrayList<>();

            for (Device device : devicePage.getContent()) {
                if (isMetadataMatched(device.getHwMetadata(), rule.getMetadataCriteria())) {
                    device.setTargetBinFirmware(rule.getTargetFirmware());
                    devicesToUpdate.add(device);
                }
            }

            if (!devicesToUpdate.isEmpty()) {
                repository.saveAll(devicesToUpdate);
                log.info("Đã update target firmware cho {} thiết bị ở page {}", devicesToUpdate.size(), page);
            }

            page++;
        } while (devicePage.hasNext());

        log.info("Hoàn tất Job gán Firmware.");
    }
}