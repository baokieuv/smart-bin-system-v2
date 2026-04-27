package com.smart_bin.product_service.repository;

import com.smart_bin.product_service.entity.Product;
import io.lettuce.core.dynamic.annotation.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;
import java.util.UUID;

public interface ProductRepository extends JpaRepository<Product, UUID> {
    Optional<Product> findByIdAndActiveTrue(UUID uuid);

    @Query("SELECT p FROM Product p WHERE p.active = true " +
            "AND (:categoryId IS NULL OR p.categoryId = :categoryId) " +
            "AND (:searchParams IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', :searchParams, '%')))")
    Page<Product> searchProducts(
            @Param("categoryId") UUID categoryId,
            @Param("searchParams") String searchParams,
            Pageable pageable
    );

    boolean existsByCategoryIdAndActiveTrue(UUID categoryId);

    boolean existsBySku(String sku);
}
