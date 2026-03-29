package com.soict.smart_bin.common;

import lombok.Getter;

import java.util.stream.Stream;

@Getter
public enum TokenType {
    VERIFY_EMAIL(0),
    RESET_PASSWORD(1);

    private final int value;

    TokenType(int value) {
        this.value = value;
    }

    public static TokenType fromValue(int value) {
        return Stream.of(values())
                .filter(state -> state.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown TokenType value: " + value));
    }
}
