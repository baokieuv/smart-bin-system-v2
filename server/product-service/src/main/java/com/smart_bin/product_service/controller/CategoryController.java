package com.smart_bin.product_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.product_service.common.SuccessCode;
import com.smart_bin.product_service.dto.request.CreateCategoryRequest;
import com.smart_bin.product_service.dto.request.UpdateCategoryRequest;
import com.smart_bin.product_service.service.CategoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final ResponseFactory responseFactory;
    private final CategoryService service;

    @GetMapping
    public ResponseEntity<ApiResponseFormat<Object>> getAllCategories() {
        return responseFactory.response(SuccessCode.OK, service.getAllCategories());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponseFormat<Object>> getCategoryById(@PathVariable String id) {
        return responseFactory.response(SuccessCode.OK, service.getCategoryById(id));
    }

    @PostMapping
    public ResponseEntity<ApiResponseFormat<Object>> createCategory(@Valid @RequestBody CreateCategoryRequest request) {
        return responseFactory.response(SuccessCode.CREATED, service.createCategory(request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponseFormat<Object>> updateCategory(
            @PathVariable String id,
            @Valid @RequestBody UpdateCategoryRequest request
    ) {
        return responseFactory.response(SuccessCode.OK, service.updateCategory(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponseFormat<Object>> deleteCategory(@PathVariable String id) {
        return responseFactory.response(SuccessCode.OK, service.deleteCategory(id));
    }
}