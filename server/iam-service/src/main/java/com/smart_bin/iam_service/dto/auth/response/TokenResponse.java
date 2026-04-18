package com.smart_bin.iam_service.dto.auth.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record TokenResponse(
        @JsonProperty("access_token")
        String accessToken,

        @JsonProperty("refresh_token")
        String refreshToken,

        @JsonProperty("expires_in")
        int expiresIn,

        @JsonProperty("refresh_expires_in")
        int refreshExpiresIn,

        @JsonProperty("token_type")
        String tokenType
) {
}
