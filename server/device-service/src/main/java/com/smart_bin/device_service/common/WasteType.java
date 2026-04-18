package com.smart_bin.device_service.common;

import lombok.Getter;

import java.util.stream.Stream;

@Getter
public enum WasteType {

    BATTERY(0),
    BIOLOGICAL(1),
    CARDBOARD(2),
    CLOTHES(3),
    GLASS(4),
    METAL(5),
    PAPER(6),
    PLASTIC(7),
    SHOES(8),
    TRASH(9);

    private final int value;

    WasteType(int value) {
        this.value = value;
    }

    public static WasteType fromValue(int value) {
        return Stream.of(values())
                .filter(type -> type.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown WasteType value: " + value));
    }
}