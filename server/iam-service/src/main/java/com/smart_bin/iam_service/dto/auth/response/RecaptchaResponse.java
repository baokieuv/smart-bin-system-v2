package com.smart_bin.iam_service.dto.auth.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record RecaptchaResponse(
        boolean success,
        double score,
        String action,
        @JsonProperty("error-codes") List<String> errorCodes
) {}
