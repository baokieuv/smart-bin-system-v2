package com.soict.smart_bin.common;

import java.util.stream.Stream;

public enum UserState {
    PENDING(0),
    ACTIVE(1),
    SUSPENDED(2),
    DELETED(3);

    private final int value;

    UserState(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }

    public static UserState fromValue(int value) {
        return Stream.of(values())
                .filter(state -> state.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown UserState value: " + value));
    }
}