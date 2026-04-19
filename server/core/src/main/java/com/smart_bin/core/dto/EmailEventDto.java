package com.smart_bin.core.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.smart_bin.core.common.EmailType;

public record EmailEventDto(
        EmailType emailType,

        JsonNode data
) {
}
