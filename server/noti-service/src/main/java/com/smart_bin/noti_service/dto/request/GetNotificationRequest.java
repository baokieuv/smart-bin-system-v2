package com.smart_bin.noti_service.dto.request;

public record GetNotificationRequest(
        Long rowNum,

        Long startAt
) {
}
