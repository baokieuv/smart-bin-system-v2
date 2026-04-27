package com.smart_bin.product_service.service;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.product_service.dto.request.CreateProductRequest;
import com.smart_bin.product_service.dto.request.UpdateProductRequest;
import com.smart_bin.product_service.dto.response.ProductResponse;
import com.smart_bin.product_service.entity.Category;
import com.smart_bin.product_service.entity.Product;
import com.smart_bin.product_service.exception.ProductErrorCode;
import com.smart_bin.product_service.mapper.ProductMapper;
import com.smart_bin.product_service.repository.CategoryRepository;
import com.smart_bin.product_service.repository.ProductRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProductService {
    private final ProductRepository repository;
    private final CategoryRepository categoryRepository;
    private final InventoryService inventoryService;
    private final ProductMapper mapper;

    public Page<ProductResponse> getProducts(Long page, Long size, String categoryId, String searchParams) {
        int pageIndex = (page != null && page > 0) ? page.intValue() - 1 : 0;
        int pageSize = (size != null && size > 0) ? size.intValue() : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        UUID catId = parseUUIDOrNull(categoryId);
        String search = (searchParams != null && !searchParams.trim().isEmpty()) ? searchParams.trim() : null;

        return repository.searchProducts(catId, search, pageable).map(mapper::toResponse);
    }

    @Cacheable(value = "product", key = "#id")
    public ProductResponse getProductById(String id) {
        return mapper.toResponse(findProductActiveById(id));
    }

    @Transactional
    public ProductResponse createProduct(CreateProductRequest request) {
        // Business logic: Kiểm tra trùng SKU
        if (repository.existsBySkuAndActiveTrue(request.sku())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Product SKU already exists");
        }

        // Kiểm tra Category có tồn tại không
        Category category = categoryRepository.findByIdAndActiveTrue(request.categoryId())
                .orElseThrow(() -> new ApiException(ProductErrorCode.CATEGORY_NOT_FOUND, "Category not found"));

        Product product = mapper.toEntity(request);
        product.setCategoryId(category.getId());
        product.setActive(true);

        product = repository.save(product);

        inventoryService.initializeInventory(product.getSku());

        return mapper.toResponse(product);
    }

    @Transactional
    @CacheEvict(value = "product", key = "#id")
    public ProductResponse updateProductById(String id, UpdateProductRequest request) {
        Product product = findProductActiveById(id);

        // Nếu request gửi lên categoryId mới, phải check và update Category
        if (request.categoryId() != null && !request.categoryId().equals(product.getCategoryId())) {
            Category newCategory = categoryRepository.findByIdAndActiveTrue(request.categoryId())
                    .orElseThrow(() -> new ApiException(ProductErrorCode.CATEGORY_NOT_FOUND, "New Category not found or deleted"));
            product.setCategoryId(newCategory.getId());
        }

        mapper.updateProductFromRequest(request, product);
        return mapper.toResponse(repository.save(product));
    }


    @Transactional
    @CacheEvict(value = "product", key = "#id")
    public String deleteProductById(String id) {
        Product product = findProductActiveById(id);

        product.setActive(false);
        repository.save(product);

        return "Deleted product successfully";
    }

    private Product findProductActiveById(String id) {
        UUID productId = parseUUID(id);
        return repository.findByIdAndActiveTrue(productId)
                .orElseThrow(() -> new ApiException(ProductErrorCode.PRODUCT_NOT_FOUND, "Product not found"));
    }

    private UUID parseUUID(String id) {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid ID format");
        }
    }

    private UUID parseUUIDOrNull(String id) {
        if (id == null || id.trim().isEmpty()) return null;
        return parseUUID(id);
    }
}
