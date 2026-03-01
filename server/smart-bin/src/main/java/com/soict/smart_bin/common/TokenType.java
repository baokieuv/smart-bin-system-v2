package com.soict.smart_bin.common;

import java.util.stream.Stream;

public enum TokenType {
    VERIFY_EMAIL(0),
    RESET_PASSWORD(1);

    private final int value;

    TokenType(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }

    public static TokenType fromValue(int value) {
        return Stream.of(values())
                .filter(state -> state.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown TokenType value: " + value));
    }
}
