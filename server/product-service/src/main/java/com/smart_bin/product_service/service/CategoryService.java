package com.smart_bin.product_service.service;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.product_service.dto.request.CreateCategoryRequest;
import com.smart_bin.product_service.dto.request.UpdateCategoryRequest;
import com.smart_bin.product_service.dto.response.CategoryResponse;
import com.smart_bin.product_service.entity.Category;
import com.smart_bin.product_service.exception.ProductErrorCode;
import com.smart_bin.product_service.mapper.CategoryMapper;
import com.smart_bin.product_service.repository.CategoryRepository;
import com.smart_bin.product_service.repository.ProductRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository repository;
    private final ProductRepository productRepository;
    private final CategoryMapper mapper;

    public Page<CategoryResponse> getAllCategories(Long page, Long size) {
        int pageIndex = (page != null && page > 0) ? page.intValue() - 1 : 0;
        int pageSize = (size != null && size > 0) ? size.intValue() : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        return repository.findAllByActiveTrue(pageable).map(mapper::toResponse);
    }

    public CategoryResponse getCategoryById(String id) {
        return mapper.toResponse(findCategoryById(id));
    }

    @Transactional
    public CategoryResponse createCategory(CreateCategoryRequest request) {
        if (repository.existsByNameAndActiveTrue(request.name())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Category name already exists");
        }

        Category category = mapper.toEntity(request);
        category.setActive(true);
        return mapper.toResponse(repository.save(category));
    }

    @Transactional
    public CategoryResponse updateCategory(String id, UpdateCategoryRequest request) {
        Category category = findCategoryById(id);

        if (request.name() != null && repository.existsByNameAndIdNotAndActiveTrue(request.name(), category.getId())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Category name already exists");
        }

        mapper.updateCategoryFromRequest(request, category);
        return mapper.toResponse(repository.save(category));
    }

    @Transactional
    public String deleteCategory(String id) {
        Category category = findCategoryById(id);

        // Logic check: Không cho phép xóa nếu có Product đang thuộc Category này
        if (productRepository.existsByCategory_IdAndActiveTrue(category.getId())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Cannot delete category. There are active products belonging to this category.");
        }

        category.setActive(false);
        repository.save(category);

        return "Deleted category successfully";
    }

    private Category findCategoryById(String id) {
        UUID categoryId = parseUUID(id);
        return repository.findByIdAndActiveTrue(categoryId)
                .orElseThrow(() -> new ApiException(ProductErrorCode.CATEGORY_NOT_FOUND, "Category not found"));
    }

    private UUID parseUUID(String id) {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid ID format");
        }
    }
}