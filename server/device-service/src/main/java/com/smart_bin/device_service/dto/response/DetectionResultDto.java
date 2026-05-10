package com.smart_bin.device_service.dto.response;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.smart_bin.device_service.common.DetectionFeedback;
import com.smart_bin.device_service.common.WasteType;

@JsonIgnoreProperties(ignoreUnknown = true)
public record DetectionResultDto(
        String detectionId,
        String detectedAt,    // ISO 8601 String từ Pi
        String image,         // Đường dẫn file cục bộ trên Pi
        String filename,
        String category,      // "paper", "plastic",...
        Double confidence,
        String userFeedback,  // "none", "correct", "wrong"
        String feedbackAt,
        String contentType
) {
}
