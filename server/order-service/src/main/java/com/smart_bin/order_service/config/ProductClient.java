package com.smart_bin.order_service.config;//package com.smart_bin.product_service.config;


import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.order_service.dto.request.ReserveInventoryRequest;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "product-service", url = "${app.feign.product-service.url}")
public interface ProductClient {

    @PostMapping("/api/v1/internal/inventories/reserve")
    ApiResponseFormat<Boolean> reserveInventory(@RequestBody ReserveInventoryRequest request);

}