package com.smart_bin.product_service.mapper;

import com.smart_bin.product_service.dto.request.CreateCategoryRequest;
import com.smart_bin.product_service.dto.request.UpdateCategoryRequest;
import com.smart_bin.product_service.dto.response.CategoryResponse;
import com.smart_bin.product_service.entity.Category;
import org.mapstruct.*;

@Mapper(componentModel = "spring")
public interface CategoryMapper {

    @Mapping(target = "id", ignore = true)
    Category toEntity(CreateCategoryRequest request);

    CategoryResponse toResponse(Category category);

    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    @Mapping(target = "id", ignore = true)
    void updateCategoryFromRequest(UpdateCategoryRequest request, @MappingTarget Category category);
}