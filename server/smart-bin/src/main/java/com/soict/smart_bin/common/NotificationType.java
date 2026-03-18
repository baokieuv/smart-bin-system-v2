package com.soict.smart_bin.common;

import java.util.stream.Stream;

public enum NotificationType {
    THRESHOLD_WARNING(0),
    THRESHOLD_CRITICAL(1),
    ANOMALY_DETECTED(2),
    DEVICE_OFFLINE(3),
    DEVICE_ONLINE(4),
    LOW_BATTERY(5),
    SENSOR_FAULT(6),
    COMMAND_SUCCESS(7),
    COMMAND_FAILED(8),
    FIRMWARE_UPDATE_SUCCESS(9),
    FIRMWARE_UPDATE_FAILED(10),
    MAINTENANCE_REQUIRED(11),
    SYSTEM_INFO(12),
    DEVICE_CREATED(13),
    DEVICE_DELETED(14),
    ;

    private final int value;

    NotificationType(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }

    public static NotificationType fromValue(int value) {
        return Stream.of(values())
                .filter(state -> state.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown NotificationType value: " + value));
    }
}
