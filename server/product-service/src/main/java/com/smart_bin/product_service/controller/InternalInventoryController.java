package com.smart_bin.product_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.product_service.common.SuccessCode;
import com.smart_bin.product_service.dto.request.ImportInventoryRequest;
import com.smart_bin.product_service.dto.request.ReserveInventoryRequest;
import com.smart_bin.product_service.service.InventoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.apache.coyote.Response;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/internal/inventories")
@RequiredArgsConstructor
public class InternalInventoryController {

    private final ResponseFactory responseFactory;
    private final InventoryService inventoryService;

    @PostMapping("/reserve")
    public ResponseEntity<ApiResponseFormat<Object>> reserveInventory(
            @Valid @RequestBody ReserveInventoryRequest request) {

        var response = inventoryService.reserveInventory(request);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping("/import-inventory")
    public ResponseEntity<ApiResponseFormat<Object>> importInventory(
            @Valid @RequestBody ImportInventoryRequest request
    ){
        var response = inventoryService.importInventory(request);
        return responseFactory.response(SuccessCode.OK, response);
    }
}
