package com.soict.smart_bin.dto.auth;

public record LoginResponse (
        String token,
        String refreshToken
){
}
