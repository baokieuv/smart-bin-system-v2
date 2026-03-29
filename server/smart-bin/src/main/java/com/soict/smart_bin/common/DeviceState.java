package com.soict.smart_bin.common;

import lombok.Getter;

import java.util.stream.Stream;

@Getter
public enum DeviceState {
    PENDING(0),
    ACTIVE(1),
    SUSPENDED(2),
    DELETED(3);

    private final int value;

    DeviceState(int value) {
        this.value = value;
    }

    public static DeviceState fromValue(int value) {
        return Stream.of(values())
                .filter(state -> state.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown DeviceState value: " + value));
    }
}
