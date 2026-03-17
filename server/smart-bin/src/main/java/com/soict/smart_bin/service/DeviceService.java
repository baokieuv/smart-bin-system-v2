package com.soict.smart_bin.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.core.io.Resource;
import com.soict.smart_bin.common.Constants;
import com.soict.smart_bin.common.DeviceState;
import com.soict.smart_bin.utils.PemUtils;
import com.soict.smart_bin.dto.device.CreateDeviceRequest;
import com.soict.smart_bin.dto.device.DeviceDto;
import com.soict.smart_bin.dto.device.UpdateDeviceRequest;
import com.soict.smart_bin.entity.Device;
import com.soict.smart_bin.entity.User;
import com.soict.smart_bin.exception.ApiException;
import com.soict.smart_bin.exception.CoreErrorCode;
import com.soict.smart_bin.exception.DeviceErrorCode;
import com.soict.smart_bin.exception.UserErrorCode;
import com.soict.smart_bin.mapper.DeviceMapper;
import com.soict.smart_bin.repository.DeviceRepository;
import com.soict.smart_bin.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.security.PublicKey;
import java.security.Signature;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class DeviceService {

    private final DeviceRepository repository;
    private final DeviceMapper mapper;
    private final ThingsBoardService thingsBoardService;
    private final UserRepository userRepository;
    private final RedisTemplate<String, String> redisTemplate;

    @Value("classpath:public_key.pem")
    private Resource publicKeyResource;
    private PublicKey serverPublicKey;

    @PostConstruct
    public void init() {
        try {
            // Read the key once when the application starts
            String path = publicKeyResource.getFile().getAbsolutePath();
            this.serverPublicKey = PemUtils.readPublicKey(path);
            System.out.println("RSA Public Key loaded successfully.");
        } catch (Exception e) {
            throw new RuntimeException("Failed to load Public Key", e);
        }
    }

    @Transactional
    public DeviceDto addDevice(CreateDeviceRequest request, String keycloakId) {

        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        Optional<Device> existingDeviceOpt = repository.findByMac(request.mac());
        Device device;

        if (existingDeviceOpt.isPresent()) {
            device = existingDeviceOpt.get();
            if (device.isActive()) {
                throw new ApiException(DeviceErrorCode.DEVICE_ALREADY_EXISTED);
            }
            // Restore soft-deleted device
            log.info("Restoring soft-deleted device with MAC: {}", request.mac());
            device.setActive(true);
        } else {
            // Initialize new device
            device = new Device();
            device.setMac(request.mac());
        }

        // ThingsBoard device name MUST strictly follow: SmartBin-<macaddress>
        String tbDeviceName = "SmartBin-" + request.mac().replace(":", "").replace("-", "");

        JsonNode tbResponse = thingsBoardService.addDevice(tbDeviceName, "SmartBin");
        String tbDeviceId = tbResponse.get("id").get("id").asText();

        // Prioritize client-provided name, fallback to ThingsBoard device name
        String displayName = (request.name() != null && !request.name().isBlank())
                ? request.name()
                : tbDeviceName;

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("macAddress", request.mac());
        attributes.put("longitude", request.longitude());
        attributes.put("latitude", request.latitude());
        attributes.put("name", displayName);

        // Update ThingsBoard attributes
        thingsBoardService.updateAttributes(tbDeviceId, Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name(), attributes);

        // Fetch new device credentials
        JsonNode credentialResponse = thingsBoardService.getDeviceCredentials(tbDeviceId);
        String accessToken = credentialResponse.get("credentialsId").asText();

        // Update local database entity
        device.setName(displayName);
        device.setLongitude(request.longitude());
        device.setLatitude(request.latitude());
        device.setDeviceId(tbDeviceId);
        device.setAccessToken(accessToken);
        device.setUser(user);
        device.setState(DeviceState.PENDING);

        Device savedDevice = repository.save(device);

        String key = Constants.PENDING_DEVICE_PREFIX + keycloakId + ":" + savedDevice.getId();

        redisTemplate.opsForValue().set(key, "pending");

        return mapper.toDto(savedDevice);
    }

    public List<DeviceDto> getListDevices(String keycloakId){
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        List<Device> devices = repository.findByUserAndActiveTrue(user);
        return devices.stream().map(mapper::toDto).collect(Collectors.toList());
    }

    public DeviceDto getDeviceDetail(String keycloakId, String deviceId){
        Device device = getDeviceAndVerifyOwnership(deviceId, keycloakId);
        return mapper.toDto(device);
    }

    @Transactional
    public DeviceDto updateDevice(String id, UpdateDeviceRequest request, String keycloakId) {

        // 1. Fetch the existing device from the database
        Device device = getDeviceAndVerifyOwnership(id, keycloakId);

        Map<String, Object> tbAttributes = new HashMap<>();
        boolean isDbUpdated = false; // Flag to track DB changes

        // 2. Check and map core fields (Updates both DB and ThingsBoard)
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

        // 3. Merge any dynamic attributes requested by the client
        if (request.additionalAttributes() != null && !request.additionalAttributes().isEmpty()) {
            tbAttributes.putAll(request.additionalAttributes());
        }

        // 4. Synchronize with ThingsBoard ONLY if there are attributes to update
        if (!tbAttributes.isEmpty()) {
            // Fallback to SERVER_SCOPE if the client didn't specify a scope
            String targetScope = Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name();

            if (request.scope() != null && !request.scope().isBlank()) {
                try {
                    // Validate if the provided scope exists in our Constants enum
                    targetScope = Constants.THINGSBOARD_SCOPE.valueOf(request.scope().toUpperCase()).name();
                } catch (IllegalArgumentException e) {
                    // Throw a custom error if the client sends a garbage scope string
                    throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid ThingsBoard scope provided: " + request.scope());
                }
            }

            thingsBoardService.updateAttributes(device.getDeviceId(), targetScope, tbAttributes);
        }

        // 5. Save to local DB ONLY if core fields were modified
        if (isDbUpdated) {
            device = repository.save(device);
        }

        return mapper.toDto(device);
    }

    @Transactional
    public void deleteDevice(String id, String keycloakId){
        Device device = getDeviceAndVerifyOwnership(id, keycloakId);

        // 1. Delete device on ThingsBoard (Hard delete)
        if (device.getDeviceId() != null) {
            thingsBoardService.deleteDevice(device.getDeviceId());
        }

        // 2. Delete device on DB (Soft delete)
         device.setActive(false);
         repository.save(device);
    }

    public DeviceDto activateDevice(String payload, String signature){
        try {
            // 1. Decode the signature from Base64 back to bytes
            byte[] digitalSignature = Base64.getDecoder().decode(signature);

            // 2. Initialize the Signature object with the Public Key
            Signature verify = Signature.getInstance("SHA256withRSA");
            verify.initVerify(serverPublicKey);

            // 3. Input the raw payload
            verify.update(payload.getBytes("UTF-8"));

            // 4. Verify
            if (verify.verify(digitalSignature)) {
                throw new ApiException(CoreErrorCode.VALIDATION_SIGNATURE_ERROR);
            }

        }
        catch (ApiException ex){
            throw ex;
        }
        catch (Exception e) {
            System.err.println("Verification error: " + e.getMessage());
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, e.getMessage());
        }

        Device device = repository.findByMacAndActiveTrue(payload).orElseThrow(() ->
                new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        device.setState(DeviceState.ACTIVE);

        Device savedDevice = repository.save(device);

        String key = Constants.PENDING_DEVICE_PREFIX + savedDevice.getUser().getKeycloakId() + ":" + savedDevice.getId();

        redisTemplate.delete(key);

        return mapper.toDto(savedDevice);
    }

    public JsonNode getTelemetries(String id, String keycloakId, String keys, long startTs, long endTs) {
        Device device = getDeviceAndVerifyOwnership(id, keycloakId);
        return thingsBoardService.getTelemetries(device.getDeviceId(), keys, startTs, endTs);
    }

    public JsonNode getAttributes(String id, String keycloakId, String keys) {
        Device device = getDeviceAndVerifyOwnership(id, keycloakId);
        return thingsBoardService.getAttributes(device.getDeviceId(), keys);
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

        // Check permission
        if (device.getUser() == null || !device.getUser().getKeycloakId().equals(keycloakId)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS);
        }
        return device;
    }
}
