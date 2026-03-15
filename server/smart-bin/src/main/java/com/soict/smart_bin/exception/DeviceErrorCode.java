package com.soict.smart_bin.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum DeviceErrorCode implements ApiResponseCode {

    DEVICE_NOT_FOUND(false, "AVT3001", "error.device_not_found", HttpStatus.NOT_FOUND),
    DEVICE_ALREADY_EXISTED(false, "AVT3002", "error.device_already_existed", HttpStatus.CONFLICT),
    DEVICE_OFFLINE(false, "AVT3003", "error.device_offline", HttpStatus.SERVICE_UNAVAILABLE),
    DEVICE_UNAUTHORIZED(false, "AVT3004", "error.device_unauthorized", HttpStatus.UNAUTHORIZED),

    // Lỗi liên quan đến cấu hình / thông số
    INVALID_DEVICE_CREDENTIALS(false, "AVT3005", "error.invalid_device_credentials", HttpStatus.BAD_REQUEST),
    TELEMETRY_DATA_INVALID(false, "AVT3006", "error.telemetry_data_invalid", HttpStatus.BAD_REQUEST),

    // Lỗi điều khiển (RPC)
    RPC_COMMAND_FAILED(false, "AVT3007", "error.rpc_command_failed", HttpStatus.INTERNAL_SERVER_ERROR),
    DEVICE_BUSY(false, "AVT3008", "error.device_is_busy", HttpStatus.CONFLICT);

    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}