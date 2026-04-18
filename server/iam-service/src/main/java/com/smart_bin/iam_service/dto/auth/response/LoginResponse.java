package com.smart_bin.iam_service.dto.auth.response;

public record LoginResponse (
        String token,
        String refreshToken
){
}
