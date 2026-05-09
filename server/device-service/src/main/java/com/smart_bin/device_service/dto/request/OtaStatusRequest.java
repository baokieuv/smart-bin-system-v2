package com.smart_bin.device_service.dto.request;

public record OtaStatusRequest(
        String status, // DOWNLOADING, SUCCESS, FAILED
        String errorMessage
) {}