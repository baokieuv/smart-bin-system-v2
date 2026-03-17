package com.soict.smart_bin.common;

public class Constants {
    public static final long VERIFICATION_TOKEN_EXPIRY = 24 * 60 * 60 * 1000L; // 24 hours

    public static final String CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    public static final int PASSWORD_LENGTH = 12;

    public static final String PENDING_DEVICE_PREFIX = "pending_device:";

    public enum THINGSBOARD_SCOPE {
        SERVER_SCOPE,
        SHARED_SCOPE,
        CLIENT_SCOPE
    }
}
