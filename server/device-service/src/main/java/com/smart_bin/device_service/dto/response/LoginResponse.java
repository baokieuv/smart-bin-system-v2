package com.smart_bin.device_service.dto.response;

public record LoginResponse(
        String token,
        String refreshToken
){
}
