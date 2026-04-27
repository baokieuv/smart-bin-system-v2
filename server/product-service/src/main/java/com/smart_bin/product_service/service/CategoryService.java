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
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository repository;
    private final ProductRepository productRepository;
    private final CategoryMapper mapper;

    public List<CategoryResponse> getAllCategories() {
        return repository.findAll().stream()
                .map(mapper::toResponse)
                .collect(Collectors.toList());
    }

    public CategoryResponse getCategoryById(String id) {
        return mapper.toResponse(findCategoryById(id));
    }

    @Transactional
    public CategoryResponse createCategory(CreateCategoryRequest request) {
        if (repository.existsByName(request.name())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Category name already exists");
        }

        Category category = mapper.toEntity(request);
        return mapper.toResponse(repository.save(category));
    }

    @Transactional
    public CategoryResponse updateCategory(String id, UpdateCategoryRequest request) {
        Category category = findCategoryById(id);

        if (request.name() != null && repository.existsByNameAndIdNot(request.name(), category.getId())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Category name already exists");
        }

        mapper.updateCategoryFromRequest(request, category);
        return mapper.toResponse(repository.save(category));
    }

    @Transactional
    public String deleteCategory(String id) {
        Category category = findCategoryById(id);

        // Logic check: Không cho phép xóa nếu có Product đang thuộc Category này
        if (productRepository.existsByCategoryIdAndActiveTrue(category.getId())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Cannot delete category. There are active products belonging to this category.");
        }

        repository.delete(category);
        return "Deleted category successfully";
    }

    private Category findCategoryById(String id) {
        UUID categoryId = parseUUID(id);
        return repository.findById(categoryId)
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