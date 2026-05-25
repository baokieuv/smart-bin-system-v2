package com.smart_bin.device_service.exception;

import com.smart_bin.core.exception.ApiResponseCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum DeviceErrorCode implements ApiResponseCode {

    DEVICE_NOT_FOUND(false, "SMB3001", "error.device_not_found", HttpStatus.NOT_FOUND),
    DEVICE_ALREADY_EXISTED(false, "SMB3002", "error.device_already_existed", HttpStatus.CONFLICT),
    DEVICE_OFFLINE(false, "SMB3003", "error.device_offline", HttpStatus.SERVICE_UNAVAILABLE),
    DEVICE_UNAUTHORIZED(false, "SMB3004", "error.device_unauthorized", HttpStatus.UNAUTHORIZED),

    // Lỗi liên quan đến cấu hình / thông số
    INVALID_DEVICE_CREDENTIALS(false, "SMB3005", "error.invalid_device_credentials", HttpStatus.BAD_REQUEST),
    TELEMETRY_DATA_INVALID(false, "SMB3006", "error.telemetry_data_invalid", HttpStatus.BAD_REQUEST),

    // Lỗi điều khiển (RPC)
    RPC_COMMAND_FAILED(false, "SMB3007", "error.rpc_command_failed", HttpStatus.INTERNAL_SERVER_ERROR),
    DEVICE_BUSY(false, "SMB3008", "error.device_is_busy", HttpStatus.CONFLICT),
    DEVICE_ALREADY_ACTIVATED(false, "SMB3009", "error.device_already_activated", HttpStatus.BAD_REQUEST),
    DEVICE_NOT_ACTIVE_YET(false, "SMB3010", "error.device_not_active_yet", HttpStatus.BAD_REQUEST),
    
    // 1. Firmware
    INVALID_FIRMWARE_TYPE(false, "SMB3011", "error.invalid_firmware_type", HttpStatus.BAD_REQUEST),
    FIRMWARE_VERSION_EXISTED(false, "SMB3012", "error.firmware_version_existed", HttpStatus.CONFLICT),
    FIRMWARE_NOT_FOUND(false, "SMB3013", "error.firmware_not_found", HttpStatus.NOT_FOUND),
    FIRMWARE_MAPPING_NOT_FOUND(false, "SMB3014", "error.firmware_mapping_not_found", HttpStatus.NOT_FOUND),

    // 2. Device Group
    DEVICE_GROUP_NOT_FOUND(false, "SMB3015", "error.device_group_not_found", HttpStatus.NOT_FOUND),
    DEVICE_GROUP_CODE_EXISTED(false, "SMB3016", "error.device_group_code_existed", HttpStatus.CONFLICT),
    DEVICE_GROUP_IN_USE(false, "SMB3017", "error.device_group_in_use", HttpStatus.BAD_REQUEST),

    // 3. Device Profile
    DEVICE_PROFILE_NOT_FOUND(false, "SMB3018", "error.device_profile_not_found", HttpStatus.NOT_FOUND),
    DEVICE_PROFILE_CODE_EXISTED(false, "SMB3019", "error.device_profile_code_existed", HttpStatus.CONFLICT),
    DEVICE_PROFILE_IN_USE(false, "SMB3020", "error.device_profile_in_use", HttpStatus.BAD_REQUEST),

    // 4. Common Validation & Access
    INVALID_ID_FORMAT(false, "SMB3021", "error.invalid_id_format", HttpStatus.BAD_REQUEST),
    INVALID_PAYLOAD_FORMAT(false, "SMB3022", "error.invalid_payload_format", HttpStatus.BAD_REQUEST),
    INVALID_METADATA_FORMAT(false, "SMB3023", "error.invalid_metadata_format", HttpStatus.BAD_REQUEST),
    DEVICE_FORBIDDEN_ACCESS(false, "SMB3024", "error.device_forbidden_access", HttpStatus.FORBIDDEN),

    // 5. Claim & Webhook
    INVALID_CLAIM_CODE(false, "SMB3025", "error.invalid_claim_code", HttpStatus.BAD_REQUEST),
    DEVICE_ALREADY_CLAIMED(false, "SMB3026", "error.device_already_claimed", HttpStatus.CONFLICT),
    DEVICE_CLAIM_CACHE_ERROR(false, "SMB3027", "error.device_claim_cache_error", HttpStatus.INTERNAL_SERVER_ERROR),
    WEBHOOK_TIMEOUT(false, "SMB3028", "error.webhook_timeout", HttpStatus.REQUEST_TIMEOUT),
    INVALID_WEBHOOK_SIGNATURE(false, "SMB3029", "error.invalid_webhook_signature", HttpStatus.UNAUTHORIZED);

    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}