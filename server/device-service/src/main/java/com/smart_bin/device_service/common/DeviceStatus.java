package com.smart_bin.device_service.common;

import lombok.Getter;

import java.util.stream.Stream;

@Getter
public enum DeviceStatus {
    ONLINE(0),
    OFFLINE(1);

    private final int value;

    DeviceStatus(int value) {
        this.value = value;
    }

    public static DeviceStatus fromValue(int value) {
        return Stream.of(values())
                .filter(state -> state.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown DeviceStatus value: " + value));
    }

    public static DeviceStatus fromString(String stateName) {
        if (stateName == null || stateName.trim().isEmpty()) {
            return null; // Trả về null thay vì ném lỗi để an toàn cho bộ lọc (filter)
        }

        try {
            return DeviceStatus.valueOf(stateName.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
