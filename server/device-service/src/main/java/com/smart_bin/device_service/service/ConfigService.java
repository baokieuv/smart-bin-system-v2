package com.smart_bin.device_service.service;

import com.nimbusds.jose.shaded.gson.JsonObject;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.device_service.common.FirmwareType;
import com.smart_bin.device_service.dto.response.DeviceConfigResponse;
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

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ConfigService {

    private final FirmwareRepository firmwareRepository;
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
            throw new ApiException(DeviceErrorCode.INVALID_FIRMWARE_TYPE);
        }

        if (firmwareRepository.findByVersionAndType(version, fwType).isPresent()) {
            throw new ApiException(DeviceErrorCode.FIRMWARE_VERSION_EXISTED);
        }

        String fileHash = securityService.calculateSha256(file);
        String signature = securityService.signResponseWithServerKey(fileHash);

        JsonNode uploadRes = mediaClient.uploadFileInternal(internalSecret, file, "firmwares_" + fwType.name() + "_" + version, "firmwares");
        String objectPath = uploadRes.get("data").get("objectUrl").asString();

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
                .orElseThrow(() -> new ApiException(DeviceErrorCode.FIRMWARE_NOT_FOUND));
        fw.setActive(false);
        firmwareRepository.save(fw);
    }

    // ==========================================
    // 2. NHÓM API CẤU HÌNH (ADMIN & OWNER & DEVICE)
    // ==========================================

    public DeviceConfigResponse getConfig(String deviceIdStr) {
        UUID deviceId = UUID.fromString(deviceIdStr);
        Device device = deviceRepository.findByIdAndActiveTrue(deviceId)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        // TODO check access

        return DeviceConfigResponse.fromData(getMergedConfigs(device), device);
    }

    public DeviceConfigResponse getConfigForDevice(String payload, String signature) {
        Device device = authenticateDeviceFromPayload(payload, signature);

        return DeviceConfigResponse.fromData(getMergedConfigs(device), device);
    }

    // ==========================================
    // 3. NHÓM API OTA DÀNH CHO THIẾT BỊ IOT
    // ==========================================

    public OtaCheckResponse checkOta(String payload, String signature) {
        Device device = authenticateDeviceFromPayload(payload, signature);

        OtaCheckResponse.FirmwareUpdateInfo esp32Update =
                checkFirmwareUpdate(device.getTargetBinFirmware(), device.getBinVersion());

        OtaCheckResponse.FirmwareUpdateInfo piUpdate =
                checkFirmwareUpdate(device.getTargetDesktopFirmware(), device.getDesktopVersion());

        return new OtaCheckResponse(esp32Update, piUpdate);
    }

    @Transactional
    public void reportOtaStatus(String payload, String signature) {
        Device device = authenticateDeviceFromPayload(payload, signature);

        JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
        String status = payloadObj.get("status").getAsString();
        String message = payloadObj.has("message") && !payloadObj.get("message").isJsonNull()
                ? payloadObj.get("message").getAsString()
                : "";

        log.info("Device {} reported OTA status: {} - {}", device.getMac(), status, message);

        if ("SUCCESS".equalsIgnoreCase(status)) {
            // Desktop hiện tại chưa xử lý OTA, chỉ cập nhật bin version cho ESP32.
            if (device.getTargetBinFirmware() != null) {
                device.setBinVersion(device.getTargetBinFirmware().getVersion());
            }
            if (device.getTargetDesktopFirmware() != null) {
                device.setDesktopVersion(device.getTargetDesktopFirmware().getVersion());
            }
            deviceRepository.save(device);
        }
    }

    // --- Utils ---
    private OtaCheckResponse.FirmwareUpdateInfo checkFirmwareUpdate(Firmware targetFw, String currentVersion) {
        if (targetFw == null || !targetFw.isActive()) {
            return new OtaCheckResponse.FirmwareUpdateInfo(false, null, null, null);
        }

        if (targetFw.getVersion().equals(currentVersion)) {
            return new OtaCheckResponse.FirmwareUpdateInfo(false, null, null, null);
        }

        return new OtaCheckResponse.FirmwareUpdateInfo(
                true,
                targetFw.getVersion(),
                targetFw.getObjectPath(),
                targetFw.getSignature()
        );
    }

    private Device authenticateDeviceFromPayload(String payload, String signature) {
        JsonObject payloadObj = securityService.parsePayloadAndCheckTimestamp(payload);
        String mac = payloadObj.get("mac").getAsString();

        Device device = deviceRepository.findByMacWithGroup(mac)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));
        securityService.verifySignatureWithDeviceKey(payload, signature, device.getPublicKey());

        return device;
    }

    private Device getDeviceAndVerifyOwnership(String deviceIdStr, String keycloakId) {
        UUID deviceId;
        try {
            deviceId = UUID.fromString(deviceIdStr);
        } catch (IllegalArgumentException e) {
            throw new ApiException(DeviceErrorCode.INVALID_ID_FORMAT);
        }

        Device device = deviceRepository.findByIdAndActiveTrue(deviceId)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_NOT_FOUND));

        if (!keycloakId.equals(device.getUserId()) && !keycloakId.equals(device.getTenantId())) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS);
        }
        return device;
    }

    private Map<String, Object> getMergedConfigs(Device device) {
        Map<String, Object> finalConfig = new HashMap<>();

        // 1. Cấp User: Thêm cấu hình của người dùng trước
        if (device.getUserConfigs() != null) {
            finalConfig.putAll(device.getUserConfigs());
        }

        // 2. Cấp Tenant (Device Group): Đè lên cấu hình User nếu có thuộc tính trùng
        if (device.getDeviceGroup() != null && device.getDeviceGroup().getSharedSpecs() != null) {
            finalConfig.putAll(device.getDeviceGroup().getSharedSpecs());
        }

        return finalConfig;
    }
}