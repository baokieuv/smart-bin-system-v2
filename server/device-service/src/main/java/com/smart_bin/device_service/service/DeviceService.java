package com.smart_bin.device_service.service;

import com.nimbusds.jose.shaded.gson.JsonObject;
import com.smart_bin.core.common.Constants;
import com.smart_bin.core.common.NotificationType;
import com.smart_bin.core.common.UserRole;
import com.smart_bin.core.dto.NotificationEventDto;
import com.smart_bin.core.dto.PageResponseDto;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.device_service.common.*;
import com.smart_bin.device_service.config.IamServiceClient;
import com.smart_bin.device_service.config.MediaServiceClient;
import com.smart_bin.device_service.dto.request.*;
import com.smart_bin.device_service.dto.response.*;
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
import com.smart_bin.core.common.DevicePermission;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
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
    private final IamServiceClient iamServiceClient;
    private final KafkaService kafkaService;
    private final DeviceSecurityService securityService;
    private final DeviceGroupRepository groupRepository;
    private final DeviceGroupService deviceGroupService;
    private final FirmwareMappingRepository mappingRepository;

    private static final String CLAIM_CACHE_PREFIX = "claim:mac:";

    @Value("${app.media-service.internal-secret:SUPER_SECRET_INTERNAL_KEY}")
    private String internalSecret;

    @Value("${app.secret-key:DEFAULT_CLAIM_SECRET_KEY}")
    private String claimSecret;

    @Transactional
    public List<ImportDeviceResponse> importDevicesByTenant(ImportDeviceRequest request, String tenantId) {
        List<ImportDeviceResponse> results = new ArrayList<>();

        DeviceGroup defaultGroup = deviceGroupService.getOrCreateDefaultGroupForTenant(tenantId);
        String tbProfileId = defaultGroup.getTbProfileId();

        for (DeviceImportItem item : request.devices()) {
            String mac = item.mac();
            String claimCode = item.claimCode();

            String expectedCode = securityService.generateDeviceSecret(mac, com.smart_bin.device_service.common.Constants.TENANT_CLAIM_KEY)
                    .substring(0, 6).toUpperCase();

            if (claimCode == null || !claimCode.toUpperCase().equals(expectedCode)) {
                results.add(new ImportDeviceResponse(mac, "FAILED", "Claim code không hợp lệ."));
                continue;
            }

            Optional<Device> deviceOpt = repository.findByMac(mac);
            Device targetDevice;

            if (deviceOpt.isPresent()) {
                Device device = deviceOpt.get();

                if (device.getTenantId() != null && !device.getTenantId().equals(tenantId)) {
                    results.add(new ImportDeviceResponse(mac, "FAILED", "Thiết bị đã thuộc quyền quản lý của Tenant khác."));
                    continue;
                } else if (device.getTenantId() != null) {
                    results.add(new ImportDeviceResponse(mac, "SKIPPED", "Thiết bị đã nằm trong danh sách của bạn."));
                    continue;
                } else {
                    targetDevice = device;
                    results.add(new ImportDeviceResponse(mac, "SUCCESS", "Gán Tenant thành công cho thiết bị đã tồn tại."));
                }
            } else {
                targetDevice = new Device();
                targetDevice.setMac(mac);
                targetDevice.setState(DeviceState.PENDING); // Trạng thái chờ kích hoạt
                results.add(new ImportDeviceResponse(mac, "SUCCESS", "Import thiết bị mới thành công (chờ kích hoạt)."));
            }

            if (item.latitude() != null) targetDevice.setLatitude(item.latitude());
            if (item.longitude() != null) targetDevice.setLongitude(item.longitude());
            if (item.description() != null) targetDevice.setDescription(item.description());

            targetDevice.setTenantId(tenantId);
            targetDevice.setDeviceGroup(defaultGroup);

            syncWithThingsBoard(targetDevice, mac);

            assignGroupToDevice(targetDevice);

            if (tbProfileId != null && targetDevice.getDeviceId() != null) {
                try {
                    thingsBoardService.assignProfileToDevice(targetDevice.getDeviceId(), tbProfileId);
                } catch (Exception e) {
                    log.error("Lỗi khi gán profile cho thiết bị {} lúc import", mac, e);
                }
            }

            repository.save(targetDevice);
        }

        return results;
    }

    @Transactional
    public String claimDevice(ClaimDeviceRequest request, String userId, String tenantId) {
        String expectedCode = securityService.generateDeviceSecret(request.mac(), com.smart_bin.device_service.common.Constants.USER_CLAIM_KEY)
                .substring(0, 6).toUpperCase();

        if (request.claimCode() == null || !request.claimCode().toUpperCase().equals(expectedCode)) {
            throw new ApiException(DeviceErrorCode.INVALID_CLAIM_CODE);
        }

        Optional<Device> deviceOpt = repository.findByMac(request.mac());

        return deviceOpt.map(device -> claimExistingDevice(device, request, userId, tenantId))
                .orElseGet(() -> createPendingDeviceForFutureProvision(request, userId, tenantId));
    }

//    @Cacheable(value = "device_list", key = "#keycloakId + ':' + #page + ':' + #size")
    public PageResponseDto<DeviceDto> getListDevices(String keycloakId, String tenantId, String permissions, int page, int size) {
        verifyPermission(keycloakId, tenantId, permissions, DevicePermission.VIEW_DEVICE.name());

        int pageIndex = (page > 0) ? page - 1 : 0;
        int pageSize = (size > 0) ? size : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        Page<Device> devices;

        if (Constants.DEFAULT_TENANT_ID.equals(tenantId)) {
            devices = repository.findByUserIdAndActiveTrue(keycloakId, pageable);
        } else {
            devices = repository.findByTenantIdAndActiveTrue(tenantId, pageable);
        }
        Page<DeviceDto> dtoPage = devices.map(mapper::toDto);

        return new PageResponseDto<>(dtoPage);
    }

    public Page<DeviceDto> getAllDevicesForAdmin(int page, int size, String actorId, String tenantId, boolean isSuperAdmin) {
        int pageIndex = (page > 0) ? page - 1 : 0;
        int pageSize = (size > 0) ? size : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        Page<Device> devices;

        if (isSuperAdmin) {
            // Nếu là SUPER_ADMIN -> Lấy toàn bộ thiết bị trên hệ thống
            devices = repository.findAllForAdminWithConfig(pageable);
        } else {
            // Nếu chỉ là ADMIN (Tenant) -> Chỉ lấy thiết bị do Tenant này sở hữu
            devices = repository.findAllByTenantIdForAdminWithConfig(tenantId, pageable);
        }

        return devices.map(mapper::toDto);
    }

//    @Cacheable(value = "device_detail", key = "#keycloakId + ':' + #deviceId")
    public DeviceDto getDeviceDetail(String keycloakId, String tenantId, String deviceId, String permissions){
        verifyPermission(permissions, DevicePermission.VIEW_DEVICE.name(), keycloakId, tenantId);

        Device device = getDeviceAndVerifyOwnership(deviceId, keycloakId, tenantId);
        return mapper.toDto(device);
    }

    @Transactional
    @Caching(
            put = { @CachePut(value = "device_detail", key = "#keycloakId + ':' + #id") },
            evict = { @CacheEvict(value = "device_list", allEntries = true) }
    )
    public DeviceDto updateDeviceByUser(String id, UpdateDeviceUserRequest request, String keycloakId, String tenantId, String permissions) {
        verifyPermission(permissions, DevicePermission.EDIT_DEVICE.name(), keycloakId, tenantId);

        Device device = getDeviceAndVerifyOwnership(id, keycloakId, tenantId);
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
            Map<String, Object> sharedAttributes = new HashMap<>();
            if (currentConfigs == null) {
                currentConfigs = new HashMap<>();
            }

            if (request.pollingInterval() != null) {
                currentConfigs.put("polling_interval", request.pollingInterval());
                sharedAttributes.put("polling_interval", request.pollingInterval());
            }
            if (request.fullThreshold() != null) {
                currentConfigs.put("full_threshold", request.fullThreshold());
                sharedAttributes.put("max_high_average_waste_threshold", request.fullThreshold());
                sharedAttributes.put("clear_high_average_waste_threshold", request.fullThreshold() - 10.0);
            }

            device.setUserConfigs(currentConfigs);
            isDbUpdated = true;

            if (!sharedAttributes.isEmpty() && device.getDeviceId() != null) {
                thingsBoardService.updateAttributes(device.getDeviceId(), Constants.THINGSBOARD_SCOPE.SHARED_SCOPE.name(), sharedAttributes);
            }
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
    public DeviceDto updateDeviceByTenant(String id, UpdateDeviceTenantRequest request, String tenantId) {
        Device device = getDeviceAndVerifyOwnership(id, tenantId, tenantId);

        if (request.groupId() != null) {
            if (request.groupId().trim().isEmpty()) {
                device.setDeviceGroup(null);
            } else {
                UUID groupId = parseUUID(request.groupId());

                DeviceGroup group = groupRepository.findByIdAndTenantIdAndActiveTrue(groupId, tenantId)
                        .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_GROUP_NOT_FOUND));

                device.setDeviceGroup(group);
            }
            device = repository.save(device);
        }

        return mapper.toDto(device);
    }

    public List<String> assignDevicesToGroup(AssignDevicesToGroupRequest request, String tenantId){
        DeviceGroup group = groupRepository.findByIdAndTenantIdAndActiveTrue(parseUUID(request.groupId()), tenantId)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_GROUP_NOT_FOUND));

        String tbProfileId = group.getTbProfileId();

        List<Device> devicesToUpdate = repository.findByMacInAndActiveTrue(request.macAddresses()).stream()
                .filter(device -> tenantId.equals(device.getTenantId()))
                .collect(Collectors.toList());

        for (Device device : devicesToUpdate) {
            device.setDeviceGroup(group);
        }
        repository.saveAll(devicesToUpdate);

        if (tbProfileId != null) {
            List<CompletableFuture<Void>> futures = devicesToUpdate.stream()
                    .filter(device -> device.getDeviceId() != null) // Chỉ gọi API với máy đã có tbDeviceId
                    .map(device -> CompletableFuture.runAsync(() -> {
                        try {
                            thingsBoardService.assignProfileToDevice(device.getDeviceId(), tbProfileId);
                            log.info("Đã gán thành công Profile cho device: {}", device.getMac());
                        } catch (Exception e) {
                            log.error("Lỗi khi gán profile cho thiết bị {} trên ThingsBoard", device.getMac(), e);
                            // Cân nhắc ném exception hoặc lưu log để retry sau
                        }
                    }))
                    .toList();

            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        }

        return devicesToUpdate.stream()
                .map(Device::getMac)
                .collect(Collectors.toList());
    }

    public List<DeviceOperationResult> assignDevicesToUser(AssignDeviceToUserRequest request, String tenantId){
        try{
            var response = iamServiceClient.verifyUserInTenant(internalSecret, tenantId, request.userId());
            if (response == null || !response.get("data").asBoolean()) {
                throw new ApiException(DeviceErrorCode.USER_NOT_FOUND_IN_TENANT);
            }
        }catch (Exception e){
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR);
        }

        List<DeviceOperationResult> results = new ArrayList<>();
        List<Device> validDevicesToSave = new ArrayList<>();

        List<Device> foundDevices = repository.findByMacInAndActiveTrue(request.macAddresses());

        Map<String, Device> deviceMap = foundDevices.stream()
                .collect(Collectors.toMap(Device::getMac, d -> d));

        for (String mac : request.macAddresses()) {
            Device device = deviceMap.get(mac);

            // Trường hợp 1: Thiết bị hoàn toàn không tồn tại trong DB
            if (device == null) {
                results.add(new DeviceOperationResult(mac, false, "Thiết bị không tồn tại hoặc đã bị vô hiệu hóa."));
                continue;
            }

            // Trường hợp 2: Vi phạm quyền sở hữu (Data Isolation)
            if (device.getTenantId() == null || !device.getTenantId().equals(tenantId)) {
                results.add(new DeviceOperationResult(mac, false, "Thiết bị không thuộc quyền sở hữu của tổ chức bạn."));
                continue;
            }

            // Trường hợp 3: Thiết bị đã được gán sẵn cho chính User này rồi (Tránh update thừa)
            if (request.userId().equals(device.getUserId())) {
                results.add(new DeviceOperationResult(mac, true, "Thiết bị đã được gán cho người dùng này từ trước."));
                continue;
            }

            // HỢP LỆ -> Tiến hành gán User
            device.setUserId(request.userId());
            device.setState(DeviceState.ACTIVE);
            device.setClaimedAt(System.currentTimeMillis());

            validDevicesToSave.add(device);
            results.add(new DeviceOperationResult(mac, true, "Gán thiết bị thành công."));
        }
        if (!validDevicesToSave.isEmpty()) {
            repository.saveAll(validDevicesToSave);
        }

        return results;
    }


    @Transactional
    public void deleteDevice(String id, String keycloakId, String tenantId, String permissions) {
        verifyPermission(permissions, DevicePermission.DELETE_DEVICE.name(), keycloakId, tenantId);

        Device device = getDeviceAndVerifyOwnership(id, keycloakId, tenantId);

        boolean isCustomTenant = !Constants.DEFAULT_TENANT_ID.equals(device.getTenantId());
        device.setActive(isCustomTenant);

        device.setUserId(null);
        device.setState(DeviceState.PENDING);
        device.setClaimedAt(null);

        if (!isCustomTenant) {
            device.setDeviceGroup(null);
        }

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
        securityService.parsePayloadAndCheckTimestamp(payload);

        DeviceProvisionRequest request;
        try {
            request = objectMapper.readValue(payload, DeviceProvisionRequest.class);
        } catch (JacksonException e) {
            throw new ApiException(DeviceErrorCode.INVALID_PAYLOAD_FORMAT);
        }

        Optional<Device> existingDeviceOpt = repository.findByMac(request.mac());
        String deviceSecret;

        if (existingDeviceOpt.isPresent() && existingDeviceOpt.get().getPublicKey() != null) {
            deviceSecret = existingDeviceOpt.get().getPublicKey();
        } else {
            deviceSecret = securityService.generateDeviceSecret(request.mac(), com.smart_bin.device_service.common.Constants.DEVICE_CLAIM_KEY);
        }

        securityService.verifySignatureWithDeviceKey(payload, signature, deviceSecret);

        boolean isNewDevice = existingDeviceOpt.isEmpty();

        Device device = isNewDevice
                ? initializeNewDevice(request)
                : resetExistingDeviceForProvision(existingDeviceOpt.get(), request);

        device.setPublicKey(deviceSecret);

        if (device.getUserId() != null && device.getClaimedAt() == null) {
            device.setClaimedAt(System.currentTimeMillis());
        }

        syncWithThingsBoard(device, request.mac());

        // 4. Tự động tìm và gán Firmware dựa trên hw_metadata
        autoAssignFirmware(device);

        // 5. Nếu là máy mới (chưa có Config) thì tạo Default Config
        assignGroupToDevice(device);

        Device savedDevice = repository.save(device);

        // 6. Trả về Token và ID cho phần cứng
        return new DeviceProvisionResponse(
                savedDevice.getId().toString(),
                savedDevice.getDeviceId(),
                savedDevice.getAccessToken(),
                "Thiết bị kích hoạt thành công!"
        );
    }

    public JsonNode getTelemetries(String id, String keycloakId, String tenantId, String permissions, String keys, Long startTs, Long endTs) {
        verifyPermission(permissions, DevicePermission.VIEW_DEVICE.name(), keycloakId, tenantId);

        Device device = getDeviceAndVerifyOwnership(id, keycloakId, tenantId);

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

    private Device initializeNewDevice(DeviceProvisionRequest request) {
        Device device = new Device();
        device.setMac(request.mac());
        device.setHwMetadata(request.hwMetadata());
        device.setState(DeviceState.ACTIVE);
        device.setStatus(DeviceStatus.OFFLINE);
        return device;
    }

    public JsonNode executeRpc(String deviceId, RpcRequest request, String actorId, String tenantId, UserRole role, String permissions) {
        verifyPermission(permissions, DevicePermission.CONTROL_DEVICE.name(), actorId, tenantId);

        RpcMethod rpcMethod = RpcMethod.fromMethodName(request.method());
        if (!rpcMethod.isAllowed(role)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Bạn không có quyền thực thi lệnh hệ thống này!");
        }

        Device device = getDeviceAndVerifyOwnership(deviceId, actorId, tenantId);

//        boolean isTwoWay = method.equals("openLid") || method.equals("calibrateSensor");

        return thingsBoardService.sendRpcCommand(device.getDeviceId(), rpcMethod.getMethodName(), request.params(), false);
    }

    private Device resetExistingDeviceForProvision(Device device, DeviceProvisionRequest request) {
        if (device.getPublicKey() != null && device.getState() == DeviceState.ACTIVE) {
            throw new ApiException(DeviceErrorCode.DEVICE_ALREADY_ACTIVATED, "Thiết bị này đã được kích hoạt trước đó.");
        }
        device.setHwMetadata(request.hwMetadata());
        device.setState(DeviceState.ACTIVE);
        device.setStatus(DeviceStatus.OFFLINE);
        return device;
    }

    private void assignGroupToDevice(Device device) {
        if (device.getUserConfigs() == null || device.getUserConfigs().isEmpty()) {
            log.info("Thiết bị MAC {} chưa có cấu hình riêng. Tiến hành sao chép cấu hình từ Device Group...", device.getMac());

            AtomicReference<Double> fullThreshold = new AtomicReference<>(80.0);
            AtomicReference<Double> clearThreshold = new AtomicReference<>(70.0);
            int pollingInterval = 300;

            if (device.getDeviceGroup() != null) {
                DeviceGroup group = device.getDeviceGroup();

                if (group.getAlarmRules() != null) {
                    // Giả định Entity DeviceGroup có quan hệ hoặc chứa danh sách AlarmRule định nghĩa trước
                    group.getAlarmRules().stream()
                            .filter(rule -> "HIGH_AVERAGE_WASTE".equals(rule.alarmType()))
                            .findFirst()
                            .ifPresent(rule -> {
                                fullThreshold.set(rule.threshold());
                                clearThreshold.set(rule.clearThreshold());
                            });
                }
            }

            Map<String, Object> dynamicConfigs = new HashMap<>();
            dynamicConfigs.put("polling_interval", pollingInterval);
            dynamicConfigs.put("full_threshold", fullThreshold.get());
            device.setUserConfigs(dynamicConfigs);

            Map<String, Object> sharedAttrs = new HashMap<>();
            sharedAttrs.put("polling_interval", pollingInterval);
            sharedAttrs.put("max_high_average_waste_threshold", fullThreshold.get());
            sharedAttrs.put("clear_high_average_waste_threshold", clearThreshold.get());

            if (device.getDeviceId() != null) {
                thingsBoardService.updateAttributes(device.getDeviceId(), Constants.THINGSBOARD_SCOPE.SHARED_SCOPE.name(), sharedAttrs);
                log.info("Đã đồng bộ cấu hình mặc định từ Group lên ThingsBoard cho thiết bị {}", device.getMac());
            }
        }
    }

    private void syncWithThingsBoard(Device device, String mac) {
        Map<String, Object> attributes = new HashMap<>();

        if (device.getDeviceId() == null) {
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

    private Device getDeviceAndVerifyOwnership(String deviceIdStr, String actorId, String tenantId) {
        UUID deviceId = parseUUID(deviceIdStr);
        Device device = repository.findByIdAndActiveTrue(deviceId)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        if (Constants.DEFAULT_TENANT_ID.equals(tenantId)) {
            // Nếu là User cá nhân (Default Tenant) -> Chỉ được phép cấu hình máy của chính mình
            if (!Objects.equals(actorId, device.getUserId())) {
                throw new ApiException(DeviceErrorCode.DEVICE_FORBIDDEN_ACCESS);
            }
        } else {
            // Nếu là User thuộc Doanh nghiệp/Tổ chức (Custom Tenant) -> Có quyền với toàn bộ máy của Tenant
            if (!Objects.equals(tenantId, device.getTenantId())) {
                throw new ApiException(DeviceErrorCode.DEVICE_FORBIDDEN_ACCESS);
            }
        }

        return device;
    }

    private UUID parseUUID(String id) {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            throw new ApiException(DeviceErrorCode.INVALID_ID_FORMAT);
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

    private String claimExistingDevice(Device device, ClaimDeviceRequest request, String userId, String tenantId) {
        if (device.getUserId() != null) {
            throw new ApiException(DeviceErrorCode.DEVICE_ALREADY_CLAIMED);
        }

        if (device.getTenantId() != null && !device.getTenantId().equals(tenantId)) {
            throw new ApiException(DeviceErrorCode.DEVICE_ALREADY_CLAIMED);
        }

        DeviceGroup defaultGroup = deviceGroupService.getOrCreateDefaultGroupForTenant(tenantId);
        device.setDeviceGroup(defaultGroup);

        if (defaultGroup.getTbProfileId() != null && device.getDeviceId() != null) {
            thingsBoardService.assignProfileToDevice(device.getDeviceId(), defaultGroup.getTbProfileId());
        }

        device.setTenantId(tenantId);
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

    private String createPendingDeviceForFutureProvision(ClaimDeviceRequest request, String userId, String tenantId) {
        try {
            Device device = new Device();

            if (device.getTenantId() != null && !device.getTenantId().equals(tenantId)) {
                throw new ApiException(DeviceErrorCode.DEVICE_ALREADY_CLAIMED);
            }

            DeviceGroup defaultGroup = deviceGroupService.getOrCreateDefaultGroupForTenant(tenantId);
            device.setDeviceGroup(defaultGroup);

            device.setMac(request.mac());
            device.setUserId(userId);
            device.setState(DeviceState.PENDING); // Đặt trạng thái chờ
            device.setStatus(DeviceStatus.OFFLINE);

            if (StringUtils.hasText(request.name())) {
                device.setName(request.name());
            }
            if (request.latitude() != null) {
                device.setLatitude(request.latitude());
            }
            if (request.longitude() != null) {
                device.setLongitude(request.longitude());
            }

            repository.save(device);
            return "Đã ghi nhận yêu cầu. Thiết bị sẽ liên kết khi cắm điện.";
        } catch (Exception e) {
            throw new ApiException(DeviceErrorCode.DEVICE_CLAIM_CACHE_ERROR);
        }
    }

    private DetectionResultDto parseMetadata(String metadata) {
        try {
            return objectMapper.readValue(metadata, DetectionResultDto.class);
        } catch (JacksonException e) {
            throw new ApiException(DeviceErrorCode.INVALID_METADATA_FORMAT);
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

    private void verifyPermission(String actorId, String tenantId, String permissionsClaim, String requiredPermission) {
        if (Objects.equals(actorId, tenantId)) {
            return;
        }

        if (permissionsClaim == null || !permissionsClaim.contains(requiredPermission)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Bạn không có quyền thực hiện thao tác này (" + requiredPermission + ").");
        }
    }
}