package com.soict.smart_bin.dto.device;

import com.soict.smart_bin.common.DetectionFeedback;
import com.soict.smart_bin.common.WasteType;

public record DetectionResultDto(
        String filename,
        WasteType type,
        Double confidence,
        DetectionFeedback feedback,
        Long timestamp
) {
}
