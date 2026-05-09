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

import java.util.Collections;
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

    @Transactional
    public void initializeInventoryBatch(List<String> skus) {
        if (skus == null || skus.isEmpty()) return;

        // Giả sử Entity của bạn tên là InventoryItem
        List<Inventory> newInventories = skus.stream().map(sku -> {
            Inventory inv = new Inventory();
            inv.setProductSku(sku);
            inv.setQuantityAvailable(0L); // Khởi tạo số lượng bằng 0
            inv.setQuantityReserved(0L);
            return inv;
        }).toList();

        repository.saveAll(newInventories); // Lưu 1 lần xuống DB
    }

    // 2. Admin nhập kho
    @Transactional
    public boolean importInventory(ImportInventoryRequest request) {
        // 1. [QUAN TRỌNG]: Sắp xếp SKU theo Alphabet trước khi Lock DB để chống Deadlock.
        List<String> sortedSkus = request.items().stream()
                .map(InventoryItemDto::sku)
                .sorted()
                .toList();

        // 2. Map lại dữ liệu để tra cứu số lượng cần nhập (O(1))
        Map<String, Long> itemMap = request.items().stream()
                .collect(Collectors.toMap(
                        InventoryItemDto::sku,
                        InventoryItemDto::quantity,
                        Long::sum // Nếu trùng SKU thì cộng dồn số lượng lại với nhau
                ));

        // 3. Tiến hành duyệt theo thứ tự đã sort và khóa dòng
        for (String sku : sortedSkus) {
            Inventory inventory = repository.findByProductSkuWithLock(sku)
                    .orElseThrow(() -> new ApiException(
                            CoreErrorCode.BAD_REQUEST,
                            "Inventory not found for SKU: " + sku
                    ));

            Long importQty = itemMap.get(sku);

            // Cộng dồn số lượng
            inventory.setQuantityAvailable(inventory.getQuantityAvailable() + importQty);

            repository.save(inventory);

            log.info("Imported {} items to SKU: {}", importQty, sku);
        }

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
                .collect(Collectors.toMap(
                        InventoryItemDto::sku,
                        InventoryItemDto::quantity,
                        Long::sum // Nếu trùng SKU thì cộng dồn số lượng lại với nhau
                ));

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
        List<String> sortedSkus = items.stream().map(InventoryItemDto::sku).sorted().toList();
        Map<String, Long> itemMap = items.stream()
                .collect(Collectors.toMap(InventoryItemDto::sku, InventoryItemDto::quantity, Long::sum));

        for (String sku : sortedSkus) {
            repository.findByProductSkuWithLock(sku).ifPresent(inventory -> {
                Long commitQty = itemMap.get(sku);
                long newReserved = Math.max(0, inventory.getQuantityReserved() - commitQty); // Tránh âm kho
                inventory.setQuantityReserved(newReserved);
                repository.save(inventory);
                log.info("Committed (deducted) {} reserved items for SKU: {}", commitQty, sku);
            });
        }
    }

    // 5. HOÀN TRẢ KHO (Được gọi khi Kafka báo event ORDER_CANCELLED)
    @Transactional
    public void releaseInventory(List<InventoryItemDto> items) {
        List<String> sortedSkus = items.stream().map(InventoryItemDto::sku).sorted().toList();
        Map<String, Long> itemMap = items.stream()
                .collect(Collectors.toMap(InventoryItemDto::sku, InventoryItemDto::quantity, Long::sum));

        for (String sku : sortedSkus) {
            repository.findByProductSkuWithLock(sku).ifPresent(inventory -> {
                Long releaseQty = itemMap.get(sku);
                long newReserved = Math.max(0, inventory.getQuantityReserved() - releaseQty); // Tránh âm kho

                inventory.setQuantityReserved(newReserved);
                inventory.setQuantityAvailable(inventory.getQuantityAvailable() + releaseQty);
                repository.save(inventory);
                log.info("Released (refunded) {} items back to available for SKU: {}", releaseQty, sku);
            });
        }
    }

    @Transactional
    public void deactivateInventory(String sku){
        repository.findByProductSkuWithLock(sku).ifPresent(inventory -> {
            inventory.setActive(false);
            repository.save(inventory);
            log.info("Committed deactivate items for SKU: {}", sku);
        });
    }

    public Map<String, Long> getAvailableQuantityMapBySkus(List<String> skus) {
        if (skus == null || skus.isEmpty()) {
            return Collections.emptyMap();
        }

        return repository.findByProductSkuIn(skus).stream()
                .collect(Collectors.toMap(
                        Inventory::getProductSku,
                        Inventory::getQuantityAvailable
                ));
    }
}
