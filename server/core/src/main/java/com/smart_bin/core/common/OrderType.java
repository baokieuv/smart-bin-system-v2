package com.smart_bin.core.common;

import lombok.Getter;

import java.util.stream.Stream;

@Getter
public enum OrderType {
    ORDER_PAID(0),
    ORDER_CANCELLED(1),
    ;

    private final int value;

    OrderType(int value) {
        this.value = value;
    }

    public static OrderType fromValue(int value) {
        return Stream.of(values())
                .filter(state -> state.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown TokenType value: " + value));
    }
}
