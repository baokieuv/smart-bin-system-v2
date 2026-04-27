package com.smart_bin.product_service.repository;

import com.smart_bin.product_service.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CategoryRepository extends JpaRepository<Category, UUID> {
    boolean existsByNameAndActiveTrue(String name);

    boolean existsByNameAndIdNotAndActiveTrue(String name, UUID id);

    List<Category> findAllByActiveTrue();

    Optional<Category> findByIdAndActiveTrue(UUID id);
}
