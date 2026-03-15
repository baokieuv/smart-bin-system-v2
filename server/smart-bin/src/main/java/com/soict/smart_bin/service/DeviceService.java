package com.soict.smart_bin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.soict.smart_bin.common.Constants;
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
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class DeviceService {

    private final DeviceRepository repository;
    private final DeviceMapper mapper;
    private final ThingsBoardService thingsBoardService;
    private final UserRepository userRepository;

    @Transactional
    public DeviceDto addDevice(CreateDeviceRequest request, String keycloakId) {

        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        // 1. Check if the device already exists in the database
        if (repository.findByMacAndActiveTrue(request.mac()).isPresent()) {
            throw new ApiException(DeviceErrorCode.DEVICE_ALREADY_EXISTED);
        }

        // 2. The device entity name on ThingsBoard follow the format: SmartBin-<macaddress>
        String tbDeviceName = "SmartBin-" + request.mac().replace(":", "").replace("-", "");

        // 3. Create the device entity on ThingsBoard
        JsonNode tbResponse = thingsBoardService.addDevice(tbDeviceName, "SmartBin");
        String tbDeviceId = tbResponse.get("id").get("id").asText();

        // 4. Determine the display name
        String displayName = (request.name() != null && !request.name().isBlank())
                ? request.name()
                : tbDeviceName;

        // 5. Prepare attributes to update
        Map<String, Object> attributes = new HashMap<>();
        attributes.put("macAddress", request.mac());
        attributes.put("longitude", request.longitude());
        attributes.put("latitude", request.latitude());
        attributes.put("name", displayName);

        // 6. Update attributes on ThingsBoard
        thingsBoardService.updateAttributes(tbDeviceId, Constants.THINGSBOARD_SCOPE.SERVER_SCOPE.name(), attributes);

        // 7. Retrieve device credentials (access token) from ThingsBoard
        JsonNode credentialResponse = thingsBoardService.getDeviceCredentials(tbDeviceId);
        String accessToken = credentialResponse.get("credentialsId").asText();

        // 8. Save the device to the local database
        Device device = new Device();
        device.setMac(request.mac());
        device.setName(displayName);
        device.setLongitude(request.longitude());
        device.setLatitude(request.latitude());
        device.setDeviceId(tbDeviceId);
        device.setAccessToken(accessToken);
        device.setUser(user);

        Device savedDevice = repository.save(device);

        return mapper.toDto(savedDevice);
    }

    @Transactional
    public DeviceDto updateDevice(String id, UpdateDeviceRequest request) {

        // 1. Fetch the existing device from the database
        Device device = repository.findByIdAndActiveTrue(id)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

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

    public void deleteDevice(String id){

    }

    public void getTelemetries(String id){

    }

    public void getAttributes(String id){

    }
}
