package com.soict.smart_bin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.soict.smart_bin.dto.device.CreateDeviceRequest;
import com.soict.smart_bin.dto.device.DeviceDto;
import com.soict.smart_bin.entity.Device;
import com.soict.smart_bin.exception.ApiException;
import com.soict.smart_bin.exception.CoreErrorCode;
import com.soict.smart_bin.mapper.DeviceMapper;
import com.soict.smart_bin.repository.DeviceRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class DeviceService {

    private final DeviceRepository repository;
    private final DeviceMapper mapper;
    private final ThingsBoardService thingsBoardService;

    @Transactional
    public DeviceDto addDevice(CreateDeviceRequest request){
        if (repository.findByMacAndActiveTrue(request.mac()).isPresent()){
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR);
        }

        String deviceName = request.name();
        if (deviceName == null || deviceName.trim().isEmpty()) {
            deviceName = "SmartBin-" + request.mac().replace(":", "");
        }

        JsonNode tbResponse = thingsBoardService.addDevice(deviceName, "SmartBin");
        String tbDeviceId = tbResponse.get("id").get("id").asText();

        JsonNode credentialResponse = thingsBoardService.getDeviceCredentials(tbDeviceId);
        String accessToken = credentialResponse.get("credentialsId").asText();

        Device device = new Device();
        device.setMac(request.mac());
        device.setName(deviceName);
        device.setLongitude(request.longitude());
        device.setLatitude(request.latitude());
        device.setDeviceId(tbDeviceId);
        device.setAccessToken(accessToken);

        Device savedDevice = repository.save(device);

        return mapper.toDto(savedDevice);
    }

    public void updateDevice(){

    }

    public void deleteDevice(){

    }

    public void getTelemetries(){

    }

    public void getAttributes(){

    }
}
