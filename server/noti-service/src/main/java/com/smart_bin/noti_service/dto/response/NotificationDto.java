package com.smart_bin.noti_service.dto.response;

import com.smart_bin.noti_service.common.NotificationType;

import java.time.Instant;

public record NotificationDto(
        String id,
        String title,
        String message,
        NotificationType type, // e.g., "INFO", "WARNING", "ALARM"
        boolean isRead,
        Instant createdDate
) {
}
