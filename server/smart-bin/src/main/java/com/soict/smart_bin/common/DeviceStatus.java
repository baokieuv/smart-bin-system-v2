package com.soict.smart_bin.common;

import java.util.stream.Stream;

public enum DeviceStatus {
    ONLINE(0),
    OFFLINE(1);

    private final int value;

    DeviceStatus(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }

    public static DeviceStatus fromValue(int value) {
        return Stream.of(values())
                .filter(state -> state.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown DeviceStatus value: " + value));
    }
}
