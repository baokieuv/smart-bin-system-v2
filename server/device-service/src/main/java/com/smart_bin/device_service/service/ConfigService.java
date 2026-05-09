package com.smart_bin.device_service.service;

import com.nimbusds.jose.shaded.gson.JsonObject;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.device_service.common.FirmwareType;
import com.smart_bin.device_service.dto.request.*;
import com.smart_bin.device_service.dto.response.OtaCheckResponse;
import com.smart_bin.device_service.entity.*;
import com.smart_bin.device_service.exception.DeviceErrorCode;
import com.smart_bin.device_service.repository.*;
import com.smart_bin.device_service.config.MediaServiceClient;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ConfigService {

    private final FirmwareRepository firmwareRepository;
    private final DeviceConfigRepository configRepository;
    private final DeviceRepository deviceRepository;
    private final MediaServiceClient mediaClient;
    private final DeviceSecurityService securityService;

    @Value("${media-service.internal-secret:SUPER_SECRET_INTERNAL_KEY}")
    private String internalSecret;

    // ==========================================
    // 1. NHÓM API QUẢN LÝ FIRMWARE (ADMIN)
    // ==========================================

    @Transactional
    public Firmware uploadFirmware(MultipartFile file, String version, String type, String description) {
        FirmwareType fwType;
        try {
            fwType = FirmwareType.valueOf(type.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Loại firmware không hợp lệ (Chỉ nhận ESP32 hoặc RASPBERRY_PI)");
        }

        if (firmwareRepository.findByVersionAndType(version, fwType).isPresent()) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Version firmware cho dòng thiết bị này đã tồn tại.");
        }

        String fileHash = securityService.calculateSha256(file);
        String signature = securityService.signResponseWithServerKey(fileHash);

        JsonNode uploadRes = mediaClient.uploadFileInternal(internalSecret, file, "firmwares_" + fwType.name() + "_" + version + "_", "firmwares");
        String objectPath = uploadRes.get("data").get("objectUrl").asText();

        Firmware firmware = new Firmware();
        firmware.setVersion(version);
        firmware.setType(fwType);
        firmware.setDescription(description);
        firmware.setObjectPath(objectPath);
        firmware.setSignature(signature);

        return firmwareRepository.save(firmware);
    }

    public Page<Firmware> getFirmwares(int page, int size) {
        return firmwareRepository.findAllByActiveTrue(PageRequest.of(page - 1, size));
    }

    @Transactional
    public void deleteFirmware(UUID id) {
        Firmware fw = firmwareRepository.findById(id)
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Không tìm thấy Firmware"));
        fw.setActive(false);
        firmwareRepository.save(fw);
    }

    // ==========================================
    // 2. NHÓM API CẤU HÌNH (ADMIN & OWNER & DEVICE)
    // ==========================================

    public DeviceConfig getConfig(String deviceIdStr) {
        UUID deviceId = UUID.fromString(deviceIdStr);
        return configRepository.findByDeviceId(deviceId)
                .orElseGet(() -> createDefaultConfig(deviceId));
    }

    public DeviceConfig getConfigForDevice(String payload, String signature) {
        Device device = authenticateDeviceFromPayload(payload, signature);

        return configRepository.findByDeviceId(device.getId())
                .orElseGet(() -> createDefaultConfig(device.getId()));
    }

    @Transactional
    public DeviceConfig updateOwnerConfig(String deviceIdStr, String keycloakId, UpdateOwnerConfigRequest req) {
        Device device = getDeviceAndVerifyOwnership(deviceIdStr, keycloakId);
        DeviceConfig config = getConfig(deviceIdStr);

        if (req.pollingInterval() != null) config.setPollingInterval(req.pollingInterval());
        if (req.fullThreshold() != null) config.setFullThreshold(req.fullThreshold());

        return configRepository.save(config);
    }

    @Transactional
    public DeviceConfig updateAdminConfig(String deviceIdStr, UpdateAdminConfigRequest req) {
        DeviceConfig config = getConfig(deviceIdStr);

        if (req.targetBinFirmwareId() != null) {
            Firmware binFw = firmwareRepository.findById(req.targetBinFirmwareId())
                    .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Bin Firmware không tồn tại"));
            config.setTargetBinFirmware(binFw);
        }

        if (req.targetDesktopFirmwareId() != null) {
            Firmware desktopFw = firmwareRepository.findById(req.targetDesktopFirmwareId())
                    .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Desktop Firmware không tồn tại"));
            config.setTargetDesktopFirmware(desktopFw);
        }
        return configRepository.save(config);
    }

    // ==========================================
    // 3. NHÓM API OTA DÀNH CHO THIẾT BỊ IOT
    // ==========================================

    public OtaCheckResponse checkOta(String payload, String signature) {
        Device device = authenticateDeviceFromPayload(payload, signature);

        JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
        if (!payloadObj.has("hardwareType")) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Thiếu trường hardwareType trong payload (ESP32 hoặc RASPBERRY_PI)");
        }
        FirmwareType hardwareType = FirmwareType.valueOf(payloadObj.get("hardwareType").getAsString().toUpperCase());

        DeviceConfig config = configRepository.findByDeviceId(device.getId()).orElse(null);
        if (config == null) return new OtaCheckResponse(false, null, null, null);

        Firmware targetFw = (hardwareType == FirmwareType.ESP32) ? config.getTargetBinFirmware() : config.getTargetDesktopFirmware();

        if (targetFw == null || !targetFw.isActive()) {
            return new OtaCheckResponse(false, null, null, null);
        }

        String currentVersion = (hardwareType == FirmwareType.ESP32) ? device.getBinVersion() : device.getDesktopVersion();

        if (targetFw.getVersion().equals(currentVersion)) {
            return new OtaCheckResponse(false, null, null, null);
        }

        return new OtaCheckResponse(true, targetFw.getVersion(), targetFw.getObjectPath(), targetFw.getSignature());
    }

    @Transactional
    public void reportOtaStatus(String payload, String signature, OtaStatusRequest req) {
        Device device = authenticateDeviceFromPayload(payload, signature);

        JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
        FirmwareType hardwareType = FirmwareType.valueOf(payloadObj.get("hardwareType").getAsString().toUpperCase());

        log.info("Device {} reported OTA status: {} - Error: {}", device.getMac(), req.status(), req.errorMessage());

        if ("SUCCESS".equalsIgnoreCase(req.status())) {
            DeviceConfig config = configRepository.findByDeviceId(device.getId()).orElse(null);
            if (config != null) {
                // Update đúng version cho phần cứng tương ứng
                if (hardwareType == FirmwareType.ESP32 && config.getTargetBinFirmware() != null) {
                    device.setBinVersion(config.getTargetBinFirmware().getVersion());
                } else if (hardwareType == FirmwareType.RASPBERRY_PI && config.getTargetDesktopFirmware() != null) {
                    device.setDesktopVersion(config.getTargetDesktopFirmware().getVersion());
                }
                deviceRepository.save(device);
            }
        }
    }

    // --- Utils ---
    private Device authenticateDeviceFromPayload(String payload, String signature) {
        JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
        String mac = payloadObj.get("mac").getAsString();

        Device device = deviceRepository.findByMacAndActiveTrue(mac)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        securityService.verifySignatureWithDeviceKey(payload, signature, device.getPublicKey());

        return device;
    }

    private Device getDeviceAndVerifyOwnership(String deviceIdStr, String keycloakId) {
        UUID deviceId;
        try {
            deviceId = UUID.fromString(deviceIdStr);
        } catch (IllegalArgumentException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST);
        }

        Device device = deviceRepository.findByIdAndActiveTrue(deviceId)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        if (!device.getKeycloakId().equals(keycloakId)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS);
        }
        return device;
    }

    private DeviceConfig createDefaultConfig(UUID deviceId) {
        Device device = deviceRepository.findById(deviceId).orElseThrow();
        DeviceConfig config = new DeviceConfig();
        config.setDevice(device);
        return configRepository.save(config);
    }
}