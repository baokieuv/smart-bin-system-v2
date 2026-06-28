package com.smart_bin.core.common;

import lombok.Getter;

import java.util.stream.Stream;

@Getter
public enum DevicePermission {
    VIEW_DEVICE(0),
    EDIT_DEVICE(1),
    DELETE_DEVICE(2),
    CONTROL_DEVICE(3),
    ;

    private final int value;

    DevicePermission(int value) {
        this.value = value;
    }

    public static DevicePermission fromValue(int value) {
        return Stream.of(values())
                .filter(state -> state.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown DevicePermission value: " + value));
    }
}