package com.smart_bin.product_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.product_service.common.SuccessCode;
import com.smart_bin.product_service.dto.request.CreateProductRequest;
import com.smart_bin.product_service.dto.request.UpdateProductRequest;
import com.smart_bin.product_service.service.ProductService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/products")
@RequiredArgsConstructor
public class ProductController {

    private final ResponseFactory responseFactory;
    private final ProductService service;

    @GetMapping
    @Cacheable(value = "products_page", key = "{#page, #size, #categoryId, #searchParams}")
    public ResponseEntity<ApiResponseFormat<Object>> getProducts(
            @RequestParam(required = false, defaultValue = "1") Long page,
            @RequestParam(required = false, defaultValue = "10") Long size,
            @RequestParam(required = false) String categoryId,
            @RequestParam(required = false) String searchParams
    ){
        var response = service.getProducts(page, size, categoryId, searchParams);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponseFormat<Object>> getProductById(
            @PathVariable String id
    ){
        var response = service.getProductById(id);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PostMapping
    @CacheEvict(value = "products_page", allEntries = true)
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> createProduct(
            @Valid @RequestBody CreateProductRequest request
    ){
        var response = service.createProduct(request);
        return responseFactory.response(SuccessCode.CREATED, response);
    }

    @PutMapping("/{id}")
    @Caching(evict = {
            @CacheEvict(value = "product", key = "#id"),            // Xóa cache detail
            @CacheEvict(value = "products_page", allEntries = true) // Xóa cache list
    })
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> updateProductById(
            @PathVariable String id,
            @Valid @RequestBody UpdateProductRequest request
    ){
        var response = service.updateProductById(id, request);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @DeleteMapping("/{id}")
    @Caching(evict = {
            @CacheEvict(value = "product", key = "#id"),
            @CacheEvict(value = "products_page", allEntries = true)
    })
    @PreAuthorize("hasAnyRole(" +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).ADMIN, " +
            "T(com.smart_bin.core.common.UserRole.RoleConstants).SUPER_ADMIN)")
    public ResponseEntity<ApiResponseFormat<Object>> deleteProductById(
            @PathVariable String id
    ){
        var response = service.deleteProductById(id);
        return responseFactory.response(SuccessCode.OK, response);
    }

}
