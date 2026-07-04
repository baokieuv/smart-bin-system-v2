package com.smart_bin.device_service.common;

import com.smart_bin.core.common.UserRole;
import lombok.Getter;
import org.apache.catalina.User;

import java.util.Arrays;
import java.util.List;

@Getter
public enum RpcMethod {

    // ==========================================
    // 1. CÁC LỆNH DÀNH CHO USER (VÀ ADMIN)
    // ==========================================
    OPEN_LID("openLid", RpcType.TWO_WAY, Arrays.asList(UserRole.USER, UserRole.ADMIN)),
    CLOSE_LID("closeLid", RpcType.TWO_WAY, Arrays.asList(UserRole.USER, UserRole.ADMIN)),
    LOCK_BIN("lockBin", RpcType.TWO_WAY, Arrays.asList(UserRole.USER, UserRole.ADMIN)),
    UNLOCK_BIN("unlockBin", RpcType.TWO_WAY, Arrays.asList(UserRole.USER, UserRole.ADMIN)),
    FORCE_SYNC("forceSync", RpcType.ONE_WAY, Arrays.asList(UserRole.USER, UserRole.ADMIN)),
    TRIGGER_ALARM_ALERT("triggerAlarmAlert", RpcType.ONE_WAY, Arrays.asList(UserRole.USER, UserRole.ADMIN)),
    START_STREAM("startStream", RpcType.TWO_WAY, Arrays.asList(UserRole.USER, UserRole.ADMIN)),
    STOP_STREAM("stopStream", RpcType.TWO_WAY, Arrays.asList(UserRole.USER, UserRole.ADMIN)),

    // ==========================================
    // 2. CÁC LỆNH ĐẶC QUYỀN CHỈ DÀNH CHO ADMIN
    // ==========================================
    REBOOT_DEVICE("rebootDevice", RpcType.ONE_WAY, List.of(UserRole.ADMIN)),
    CALIBRATE_SENSOR("calibrateSensor", RpcType.TWO_WAY, List.of(UserRole.ADMIN)),
    SET_POLLING_INTERVAL("setPollingInterval", RpcType.TWO_WAY, List.of(UserRole.ADMIN)),
    CLEAR_HARDWARE_ERROR("clearHardwareError", RpcType.TWO_WAY, List.of(UserRole.ADMIN)),
    TRIGGER_OTA_UPDATE("triggerOtaUpdate", RpcType.ONE_WAY, List.of(UserRole.ADMIN));

    private final String methodName;
    private final RpcType rpcType;
    private final List<UserRole> allowedRoles;

    RpcMethod(String methodName, RpcType rpcType, List<UserRole> allowedRoles) {
        this.methodName = methodName;
        this.rpcType = rpcType;
        this.allowedRoles = allowedRoles;
    }

    public static RpcMethod fromMethodName(String methodName) {
        for (RpcMethod rpc : values()) {
            if (rpc.getMethodName().equalsIgnoreCase(methodName)) {
                return rpc;
            }
        }
        throw new IllegalArgumentException("Không tìm thấy RPC method: " + methodName);
    }

    public boolean isAllowed(UserRole userRole) {
        return allowedRoles.contains(userRole);
    }

    public enum RpcType {
        ONE_WAY, TWO_WAY
    }
}