package com.smart_bin.order_service.config;//package com.smart_bin.product_service.config;


import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.order_service.dto.request.ReserveInventoryRequest;
import com.smart_bin.order_service.dto.response.ProductResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@FeignClient(name = "product-service", url = "${app.feign.product-service.url}")
public interface ProductClient {

    @PostMapping("/api/v1/inventories/reserve")
    ApiResponseFormat<Boolean> reserveInventory(
            @RequestHeader("X-Internal-Key") String secret,
            @RequestBody ReserveInventoryRequest request
    );

    @PostMapping("/api/v1/products/by-skus")
    ApiResponseFormat<List<ProductResponse>> getProductsBySkus(@RequestBody List<String> skus);
}