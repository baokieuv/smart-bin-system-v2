package com.smart_bin.device_service.dto.response;

import com.smart_bin.device_service.common.DetectionFeedback;
import com.smart_bin.device_service.common.WasteType;

public record DetectionResultDto(
        String imageUrl,
        String contentType,
        WasteType type,
        Double confidence,
        DetectionFeedback feedback,
        Long timestamp
) {
}
