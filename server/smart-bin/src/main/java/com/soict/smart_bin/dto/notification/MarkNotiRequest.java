package com.soict.smart_bin.dto.notification;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record MarkNotiRequest(
        @NotEmpty(message = "Require at least one notification ID")
        List<Long> ids,

        @NotNull(message = "isRead is required")
        Boolean isRead
) {
}
