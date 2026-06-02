package com.smart_bin.core.common;

import lombok.Getter;

import java.util.stream.Stream;

@Getter
public enum EmailType {
    VERIFICATION(0),
    WELCOME(1),
    RESET_PASSWORD(2),
    WELCOME_TENANT(3),
    ALARM_TRIGGERED(4);

    private final int value;

    EmailType(int value) {
        this.value = value;
    }

    public static EmailType fromValue(int value) {
        return Stream.of(values())
                .filter(state -> state.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown TokenType value: " + value));
    }
}