package com.soict.smart_bin.repository;

import com.soict.smart_bin.entity.Notification;
import com.soict.smart_bin.entity.User;
import io.lettuce.core.dynamic.annotation.Param;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findAllByUserOrderByCreatedDateDesc(User user, Pageable page);

    Long countByUserAndIsReadFalse(User user);

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true WHERE n.user = :user")
    void markAllAsReadByUser(@Param("user") User user);

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = :isRead WHERE n.user = :user AND n.id IN (:ids)")
    void markNotification(@Param("ids") List<Long> ids, @Param("isRead") Boolean isRead, @Param("user") User user);
}
