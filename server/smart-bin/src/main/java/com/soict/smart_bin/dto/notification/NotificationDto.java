package com.soict.smart_bin.dto.notification;

import com.soict.smart_bin.common.NotificationType;

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
