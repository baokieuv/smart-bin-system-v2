package com.smart_bin.noti_service.repository;

import com.smart_bin.noti_service.entity.Notification;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param; // Thêm import này

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    // 1. Lấy danh sách thông báo của 1 user
    List<Notification> findAllByKeycloakIdOrderByCreatedDateDesc(String keycloakId, Pageable page);

    // 2. Đếm số thông báo chưa đọc
    Long countByKeycloakIdAndIsReadFalse(String keycloakId);

    // 3. Đánh dấu TẤT CẢ là đã đọc
    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true WHERE n.keycloakId = :keycloakId")
    void markAllAsReadByKeycloakId(@Param("keycloakId") String keycloakId);

    // 4. Đánh dấu trạng thái (đọc/chưa đọc) cho một danh sách các ID cụ thể
    @Modifying
    @Query("UPDATE Notification n SET n.isRead = :isRead WHERE n.keycloakId = :keycloakId AND n.id IN (:ids)")
    void markNotifications(@Param("ids") List<Long> ids, @Param("isRead") Boolean isRead, @Param("keycloakId") String keycloakId);
}