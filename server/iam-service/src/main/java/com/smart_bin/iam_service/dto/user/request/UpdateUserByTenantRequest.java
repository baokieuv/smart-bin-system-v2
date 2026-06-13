package com.smart_bin.iam_service.dto.user.request;

import com.smart_bin.core.common.DevicePermission;
import com.smart_bin.iam_service.common.UserState;
import jakarta.validation.constraints.Size;

import java.util.Set;

public record UpdateUserByTenantRequest(
        @Size(max = 100, message = "Tên không được vượt quá 100 ký tự")
        String name,

        String avatarUrl,

        UserState state,

        Set<DevicePermission> devicePermissions
) {
}