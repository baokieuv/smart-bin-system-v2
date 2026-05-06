package com.smart_bin.product_service.repository;

import com.smart_bin.product_service.entity.Product;
import io.lettuce.core.dynamic.annotation.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductRepository extends JpaRepository<Product, UUID> {
    @EntityGraph(attributePaths = {"category"})
    Optional<Product> findByIdAndActiveTrue(UUID uuid);

    @Query(value = "SELECT p FROM Product p LEFT JOIN FETCH p.category WHERE p.active = true " +
            "AND (:categoryId IS NULL OR p.category.id = :categoryId) " +
            "AND (:searchParams IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', :searchParams, '%')))",
            countQuery = "SELECT count(p) FROM Product p WHERE p.active = true " +
                    "AND (:categoryId IS NULL OR p.category.id = :categoryId) " +
                    "AND (:searchParams IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', :searchParams, '%')))")
    Page<Product> searchProducts(
            @Param("categoryId") UUID categoryId,
            @Param("searchParams") String searchParams,
            Pageable pageable
    );

    @EntityGraph(attributePaths = {"category"})
    Page<Product> findAllByActiveTrue(Pageable pageable);

    List<Product> findBySkuInAndActiveTrue(List<String> skus);

    boolean existsByCategory_IdAndActiveTrue(UUID categoryId);

    boolean existsBySkuAndActiveTrue(String sku);

    boolean existsBySkuAndIdNotAndActiveTrue(String sku, UUID id);

    boolean existsBySku(String sku);

    @Modifying
    @Query("UPDATE Product p SET p.soldQuantity = p.soldQuantity + :quantity WHERE p.sku = :sku")
    void increaseSoldQuantityBySku(@Param("sku") String sku, @Param("quantity") Long quantity);
}
