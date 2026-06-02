package com.smart_bin.core.common;

import java.util.UUID;

public class Constants {
    public static final long VERIFICATION_TOKEN_EXPIRY = 24 * 60 * 60 * 1000L; // 24 hours
    public static final long TIMESTAMP_EXPIRY = 5 * 60 * 60 * 1000L;
    public static final long TIMESTAMP_EXPIRY_20M = 20 * 60 * 60 * 1000L;

    public static final String CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    public static final int PASSWORD_LENGTH = 12;

    public static final String PENDING_DEVICE_PREFIX = "pending_device:";
    public static final String PENDING_DETECTION_RESULT = "detection_result:";

    public static final String AVATAR_PREFIX = "avatar/image_";
    public static final String DETECTION_RESULT_PREFIX = "waste/image_";

    public static final String DEFAULT_TENANT_ID = "5cf993b8-2bd1-4ba3-9fbf-a1ba49c9b673";
    public static final String DEFAULT_GROUP_CODE = "DEFAULT_SMART_BIN";

    public enum THINGSBOARD_SCOPE {
        SERVER_SCOPE,
        SHARED_SCOPE,
        CLIENT_SCOPE
    }

    public static String generateFileName(String contentType, String prefix){
        String uniqueId = UUID.randomUUID().toString().substring(0, 12);

        return prefix + uniqueId + "." + contentType.substring(contentType.indexOf("/") + 1);
    }
}
