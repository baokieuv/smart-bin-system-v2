package com.smart_bin.product_service.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record ImportProductsRequest(
        @NotEmpty(message = "Danh sách sản phẩm không được để trống")
        List<@Valid CreateProductRequest> products
) {
}
