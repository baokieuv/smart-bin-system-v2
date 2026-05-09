package com.smart_bin.device_service.dto.request;

import java.util.UUID;

public record UpdateAdminConfigRequest(
        UUID targetBinFirmwareId,
        UUID targetDesktopFirmwareId
) {}