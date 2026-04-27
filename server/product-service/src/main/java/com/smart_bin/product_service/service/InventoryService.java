package com.smart_bin.product_service.service;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.product_service.dto.request.ImportInventoryRequest;
import com.smart_bin.product_service.dto.request.InventoryItemDto;
import com.smart_bin.product_service.dto.request.ReserveInventoryRequest;
import com.smart_bin.product_service.entity.Inventory;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import com.smart_bin.product_service.repository.InventoryRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class InventoryService {

    private final InventoryRepository repository;

    // 1. Khởi tạo kho rỗng khi tạo mới Product
    @Transactional
    public void initializeInventory(String sku) {
        if (repository.findByProductSku(sku).isEmpty()) {
            Inventory inventory = new Inventory();
            inventory.setProductSku(sku);
            inventory.setQuantityAvailable(0L);
            inventory.setQuantityReserved(0L);
            repository.save(inventory);
            log.info("Initialized inventory for SKU: {}", sku);
        }
    }

    // 2. Admin nhập kho
    @Transactional
    public boolean importInventory(ImportInventoryRequest request) {
        Inventory inventory = repository.findByProductSkuWithLock(request.sku())
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Inventory not found for SKU: " + request.sku()));

        inventory.setQuantityAvailable(inventory.getQuantityAvailable() + request.quantity());
        repository.save(inventory);
        log.info("Imported {} items to SKU: {}", request.quantity(), request.sku());

        return true;
    }

    // 3. GIỮ CHỖ (Được gọi bởi Order-Service qua Rest API)
    @Transactional
    public boolean reserveInventory(ReserveInventoryRequest request) {
        // [QUAN TRỌNG]: Phải sắp xếp SKU theo Alphabet trước khi Lock DB để chống Deadlock.
        List<String> sortedSkus = request.items().stream()
                .map(InventoryItemDto::sku)
                .sorted()
                .toList();

        Map<String, Long> itemMap = request.items().stream()
                .collect(Collectors.toMap(InventoryItemDto::sku, InventoryItemDto::quantity));

        // Tiến hành duyệt và khóa dòng
        for (String sku : sortedSkus) {
            Inventory inventory = repository.findByProductSkuWithLock(sku)
                    .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "SKU not found in inventory: " + sku));

            Long requestedQty = itemMap.get(sku);

            if (inventory.getQuantityAvailable() < requestedQty) {
                log.warn("Not enough stock for SKU {}. Available: {}, Requested: {}", sku, inventory.getQuantityAvailable(), requestedQty);
                throw new ApiException(CoreErrorCode.BAD_REQUEST, "Not enough stock for SKU: " + sku);
            }

            // Thực hiện chuyển từ Available sang Reserved
            inventory.setQuantityAvailable(inventory.getQuantityAvailable() - requestedQty);
            inventory.setQuantityReserved(inventory.getQuantityReserved() + requestedQty);
            repository.save(inventory);
        }
        log.info("Reserved inventory successfully for {} items", request.items().size());
        return true;
    }

    // 4. XÁC NHẬN TRỪ KHO (Được gọi khi Kafka báo event ORDER_PAID)
    @Transactional
    public void commitInventory(List<InventoryItemDto> items) {
        for (InventoryItemDto item : items) {
            repository.findByProductSkuWithLock(item.sku()).ifPresent(inventory -> {
                inventory.setQuantityReserved(inventory.getQuantityReserved() - item.quantity());
                repository.save(inventory);
                log.info("Committed (deducted) {} reserved items for SKU: {}", item.quantity(), item.sku());
            });
        }
    }

    // 5. HOÀN TRẢ KHO (Được gọi khi Kafka báo event ORDER_CANCELLED)
    @Transactional
    public void releaseInventory(List<InventoryItemDto> items) {
        for (InventoryItemDto item : items) {
            repository.findByProductSkuWithLock(item.sku()).ifPresent(inventory -> {
                inventory.setQuantityReserved(inventory.getQuantityReserved() - item.quantity());
                inventory.setQuantityAvailable(inventory.getQuantityAvailable() + item.quantity());
                repository.save(inventory);
                log.info("Released (refunded) {} items back to available for SKU: {}", item.quantity(), item.sku());
            });
        }
    }

}
