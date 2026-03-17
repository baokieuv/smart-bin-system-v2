package com.soict.smart_bin.common;

import java.util.stream.Stream;

public enum DeviceState {
    PENDING(0),
    ACTIVE(1),
    SUSPENDED(2),
    DELETED(3),
    ONLINE(4),
    OFFLINE(5);

    private final int value;

    DeviceState(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }

    public static DeviceState fromValue(int value) {
        return Stream.of(values())
                .filter(state -> state.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown DeviceState value: " + value));
    }
}
