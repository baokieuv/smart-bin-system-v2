package com.smart_bin.product_service.dto.request;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record ImportInventoryRequest(
        @NotEmpty(message = "Items list cannot be empty")
        List<@Valid InventoryItemDto> items
) {
}