package com.smart_bin.product_service.mapper;

import com.smart_bin.product_service.dto.request.CreateProductRequest;
import com.smart_bin.product_service.dto.request.UpdateProductRequest;
import com.smart_bin.product_service.dto.response.ProductResponse;
import com.smart_bin.product_service.entity.Product;
import org.mapstruct.*;

@Mapper(componentModel = "spring", uses = {CategoryMapper.class})
public interface ProductMapper {

    // Map Request -> Entity (Bỏ qua trường id để JPA tự sinh)
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "category", ignore = true)
    Product toEntity(CreateProductRequest request);

    // Map Entity -> Response DTO (Trả ra cho client)
    ProductResponse toResponse(Product product);

    // Patch update logic
    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "category", ignore = true)
    void updateProductFromRequest(UpdateProductRequest request, @MappingTarget Product product);
}