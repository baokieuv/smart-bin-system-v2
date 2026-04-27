package com.smart_bin.order_service.dto.request;

import java.util.List;

public record ReserveInventoryRequest(List<InventoryItemDto> items) {
    public record InventoryItemDto(String sku, Long quantity) {}
}
