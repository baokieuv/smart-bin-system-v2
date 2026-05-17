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
import com.smart_bin.device_service.config.IamServiceClient;
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
    private final DeviceConfigRepository configRepository;
    private final FirmwareMappingRepository mappingRepository;
    private final IamServiceClient iamServiceClient;
    private static final String CLAIM_CACHE_PREFIX = "claim:mac:";

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
            device.setTenantId(actorId);
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
    public String claimDevice(ClaimDeviceRequest request, String userId) {
        Optional<Device> deviceOpt = repository.findByMac(request.mac());

        if (deviceOpt.isPresent()) {
            // TH1: Thiết bị ĐÃ ĐƯỢC KÍCH HOẠT (Đã bật nguồn trước khi quét mã)
            Device device = deviceOpt.get();
            if (device.getUserId() != null) {
                throw new ApiException(CoreErrorCode.BAD_REQUEST, "Thiết bị này đã được liên kết với một tài khoản khác.");
            }

            device.setUserId(userId);
            if (request.latitude() != null) device.setLatitude(request.latitude());
            if (request.longitude() != null) device.setLongitude(request.longitude());
            if (request.name() != null && !request.name().isBlank()) device.setName(request.name());
            device.setClaimedAt(System.currentTimeMillis());

            // Đồng bộ thông tin (tên, tọa độ) lên ThingsBoard nếu thiết bị đã có ID trên TB
            if (device.getDeviceId() != null) {
                Map<String, Object> attributes = new HashMap<>();
                if (request.name() != null && !request.name().isBlank()) attributes.put("name", request.name());
                if (request.latitude() != null) attributes.put("latitude", request.latitude());
                if (request.longitude() != null) attributes.put("longitude", request.longitude());

                if (!attributes.isEmpty()) {
                    thingsBoardService.updateAttributes(device.getDeviceId(), Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name(), attributes);
                }
            }

            repository.save(device);
            return "Đã liên kết thiết bị thành công!";
        } else {
            // TH2: Thiết bị CHƯA ĐƯỢC CẤP PHÉP (Quét mã trước khi bóc hộp cắm điện)
            String cacheKey = CLAIM_CACHE_PREFIX + request.mac();
            try {
                Map<String, Object> cacheData = new HashMap<>();
                cacheData.put("userId", userId);
                if (request.name() != null && !request.name().isBlank()) cacheData.put("name", request.name());
                if (request.latitude() != null) cacheData.put("latitude", request.latitude());
                if (request.longitude() != null) cacheData.put("longitude", request.longitude());

                redisTemplate.opsForValue().set(cacheKey, objectMapper.writeValueAsString(cacheData), 7, TimeUnit.DAYS);
            } catch (Exception e) {
                throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Lỗi khi lưu thông tin thiết bị vào bộ nhớ đệm.");
            }
            return "Đã ghi nhận yêu cầu. Thiết bị sẽ tự động lấy cấu hình, tọa độ và liên kết với bạn ngay khi được cắm điện.";
        }
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
        Device device = getDeviceAndVerifyOwnership(deviceId, keycloakId);
        return mapper.toDto(device);
    }

    @Transactional
    @Caching(
            put = { @CachePut(value = "device_detail", key = "#keycloakId + ':' + #id") },
            evict = { @CacheEvict(value = "device_list", allEntries = true) }
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
            @CacheEvict(value = "device_detail", key = "#keycloakId + ':' + #id"),
            @CacheEvict(value = "device_list", allEntries = true)
    })
    public void deleteDevice(String id, String keycloakId){
        Device device = getDeviceAndVerifyOwnership(id, keycloakId);

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
    public Object provisionDevice(DeviceProvisionRequest request) {
        // 1. Xác thực Tenant Secret với IAM Service
        JsonNode uploadRes = iamServiceClient.verifyTenantSecret(internalSecret, request.tenantSecret());
        String tenantId = uploadRes.get("data").asText();

        Device device;
        Optional<Device> existingDeviceOpt = repository.findByMac(request.mac());

        DeviceGroup group = groupRepository.findByCodeAndActiveTrue(request.groupCode())
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Dòng thiết bị không hợp lệ"));

        boolean isNewDevice = false;

        if (existingDeviceOpt.isPresent()) {
            device = existingDeviceOpt.get();

            if (device.getPublicKey() != null && device.getState() == DeviceState.ACTIVE) {
                throw new ApiException(DeviceErrorCode.DEVICE_ALREADY_ACTIVATED, "Thiết bị này đã được kích hoạt trước đó.");
            }
            device.setPublicKey(request.publicKey());
            device.setHwMetadata(request.hwMetadata());
            device.setState(DeviceState.ACTIVE);
            device.setStatus(DeviceStatus.OFFLINE);
            device.setTenantId(tenantId);
            device.setDeviceGroup(group);
        } else {
            device = new Device();
            device.setMac(request.mac());
            device.setTenantId(tenantId);
            device.setPublicKey(request.publicKey());
            device.setHwMetadata(request.hwMetadata());
            device.setState(DeviceState.ACTIVE);
            device.setStatus(DeviceStatus.OFFLINE);
            device.setDeviceGroup(group);
            isNewDevice = true;
        }

        // 3. Kiểm tra xem User đã quét QR (Claim) trước đó không? (Đọc JSON từ Cache)
        String cacheKey = CLAIM_CACHE_PREFIX + request.mac();
        String cachedDataStr = redisTemplate.opsForValue().get(cacheKey);

        if (cachedDataStr != null && device.getUserId() == null) {
            JsonNode cachedData = objectMapper.readTree(cachedDataStr);
            if (cachedData.has("userId")) device.setUserId(cachedData.get("userId").asText());
            if (cachedData.has("name")) device.setName(cachedData.get("name").asText());
            if (cachedData.has("latitude")) device.setLatitude(cachedData.get("latitude").asDouble());
            if (cachedData.has("longitude")) device.setLongitude(cachedData.get("longitude").asDouble());

            device.setClaimedAt(System.currentTimeMillis());
            redisTemplate.delete(cacheKey); // Xóa khỏi cache
            log.info("Auto-mapped User {} và tọa độ cho thiết bị MAC {}", device.getUserId(), request.mac());
        }

        // Tạo trên ThingsBoard nếu là máy mới
        if (isNewDevice) {
            String defaultName = "SmartBin-" + request.mac().replace(":", "").replace("-", "");
            if (device.getName() == null || device.getName().isBlank()) {
                device.setName(defaultName);
            }

            tools.jackson.databind.JsonNode tbResponse = thingsBoardService.addDevice(defaultName, "SmartBin");
            String tbDeviceId = tbResponse.get("id").get("id").asText();

            Map<String, Object> attributes = new HashMap<>();
            attributes.put("macAddress", request.mac());
            attributes.put("name", device.getName());
            if (device.getLatitude() != null) attributes.put("latitude", device.getLatitude());
            if (device.getLongitude() != null) attributes.put("longitude", device.getLongitude());

            thingsBoardService.updateAttributes(tbDeviceId, Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name(), attributes);

            tools.jackson.databind.JsonNode credentialResponse = thingsBoardService.getDeviceCredentials(tbDeviceId);
            String accessToken = credentialResponse.get("credentialsId").asText();

            device.setDeviceId(tbDeviceId);
            device.setAccessToken(accessToken);
        } else {
            // Đồng bộ cấu hình lên TB nếu là thiết bị PENDING
            Map<String, Object> attributes = new HashMap<>();
            if (device.getName() != null) attributes.put("name", device.getName());
            if (device.getLatitude() != null) attributes.put("latitude", device.getLatitude());
            if (device.getLongitude() != null) attributes.put("longitude", device.getLongitude());

            if (!attributes.isEmpty() && device.getDeviceId() != null) {
                thingsBoardService.updateAttributes(device.getDeviceId(), Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name(), attributes);
            }
        }

        // 4. Tự động tìm và gán Firmware dựa trên hw_metadata
        autoAssignFirmware(device);

        Device savedDevice = repository.save(device);

        // 5. Nếu là máy mới (chưa có Config) thì tạo Default Config
        if (configRepository.findByDeviceId(savedDevice.getId()).isEmpty()) {
            createDefaultConfig(savedDevice);
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
        Device device = getDeviceAndVerifyOwnership(id, keycloakId);

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
                    fileInfo.filename(),
                    fileInfo.contentType()
            );

            String presignedUrl = mediaResponse.get("data").get("url").asText();
            String objectPath = mediaResponse.get("data").get("objectName").asText();

            Map<String, Object> redisData = new HashMap<>();
            redisData.put("metadata", fileInfo);
            redisData.put("objectPath", objectPath);

            String redisKey = Constants.PENDING_DETECTION_RESULT + mac + ":" + fileInfo.detectionId();

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

            String redisKey = Constants.PENDING_DETECTION_RESULT + mac + ":" + fileInfo.detectionId();
            String cachedData = redisTemplate.opsForValue().get(redisKey);

            String finalImageUrl = null;
            if (cachedData != null) {
                JsonNode root = objectMapper.readTree(cachedData);
                finalImageUrl = root.get("objectPath").asText();
            }

            DeviceDetectionResult result = new DeviceDetectionResult();
            result.setDevice(device);
            result.setConfidence(fileInfo.confidence());
            result.setImageUrl(finalImageUrl);

            if (fileInfo.category() != null) {
                result.setType(WasteType.valueOf(fileInfo.category().toUpperCase()));
            }
            if (fileInfo.userFeedback() != null) {
                result.setFeedback(DetectionFeedback.valueOf(fileInfo.userFeedback().toUpperCase()));
            }

            if (fileInfo.detectedAt() != null) {
                long ts = java.time.OffsetDateTime.parse(fileInfo.detectedAt())
                        .toInstant().toEpochMilli();
                result.setDetectedAt(ts);
            }

            detectionRepository.save(result);
            repository.save(device);

            redisTemplate.delete(redisKey);

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

        if (!device.getUserId().equals(keycloakId)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS);
        }
        return device;
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

    private void createDefaultConfig(Device device) {
        DeviceConfig config = new DeviceConfig();
        config.setDevice(device);
        config.setUserConfigs(Map.of(
                "polling_interval", 300,
                "full_threshold", 80.0
        ));
        configRepository.save(config);
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