package com.smart_bin.iam_service.dto.auth.request;

import com.smart_bin.iam_service.common.UserState;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record UpdateUserStateRequest(
        @NotNull
        UserState state
) {
}
