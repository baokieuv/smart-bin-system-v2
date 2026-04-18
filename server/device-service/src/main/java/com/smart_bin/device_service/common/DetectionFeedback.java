package com.smart_bin.device_service.common;

import lombok.Getter;

import java.util.stream.Stream;

@Getter
public enum DetectionFeedback {

    NO_FEEDBACK(0),     // chưa phản hồi
    CORRECT(1),         // detect đúng
    INCORRECT(2);       // detect sai

    private final int value;

    DetectionFeedback(int value) {
        this.value = value;
    }

    public static DetectionFeedback fromValue(int value) {
        return Stream.of(values())
                .filter(f -> f.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown DetectionFeedback value: " + value));
    }
}