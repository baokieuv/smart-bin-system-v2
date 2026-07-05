package com.smart_bin.media_service.dto.request;

import jakarta.validation.constraints.NotBlank;

public record RpcRequest(
        @NotBlank(message = "Method is required")
        String method,

        Object params
){
}
