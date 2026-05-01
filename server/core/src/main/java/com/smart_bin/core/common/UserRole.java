package com.smart_bin.core.common;

import java.util.stream.Stream;

public enum UserRole {
    USER(0, RoleConstants.USER_LOWER),
    ADMIN(1, RoleConstants.ADMIN_LOWER),
    SUPER_ADMIN(2, RoleConstants.SUPER_ADMIN_LOWER);

    private final int value;
    private final String roleName; // Tên viết thường để map với Keycloak

    UserRole(int value, String roleName) {
        this.value = value;
        this.roleName = roleName;
    }

    public int getValue() {
        return value;
    }

    public String getRoleName() {
        return roleName;
    }

    public static UserRole fromValue(int value) {
        return Stream.of(values())
                .filter(state -> state.value == value)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown UserRole value: " + value));
    }

    // Hàm an toàn để chuyển từ String (body request) sang Enum
    public static UserRole fromString(String role) {
        return Stream.of(values())
                .filter(r -> r.name().equalsIgnoreCase(role) || r.roleName.equalsIgnoreCase(role))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Role không hợp lệ: " + role));
    }

    // Dùng class này để chứa các hằng số bắt buộc cho @PreAuthorize
    public static class RoleConstants {
        public static final String ADMIN = "ADMIN";
        public static final String SUPER_ADMIN = "SUPER_ADMIN";

        public static final String USER_LOWER = "user";
        public static final String ADMIN_LOWER = "admin";
        public static final String SUPER_ADMIN_LOWER = "super_admin";
    }
}