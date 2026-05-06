package com.smart_bin.device_service.dto.request;

public record AppVersionInfo(
        String desktopVer,

        String binVer,

        String desktopUrl,

        String binUrl
) {
}
