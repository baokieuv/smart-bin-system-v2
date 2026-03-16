package com.soict.smart_bin.repository;

import com.soict.smart_bin.entity.Device;
import com.soict.smart_bin.entity.Notification;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationRepository extends JpaRepository<Notification, String> {

}
