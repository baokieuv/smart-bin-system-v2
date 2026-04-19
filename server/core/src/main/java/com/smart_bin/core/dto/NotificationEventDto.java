package com.smart_bin.core.dto;

import com.smart_bin.core.common.NotificationType;

public record NotificationEventDto (
        String keycloakId,
        String title,
        String message,
        NotificationType type // Hoặc dùng thẳng Enum NotificationType nếu bạn đã tạo
) {

}
