package com.soict.smart_bin.service;

import com.soict.smart_bin.entity.Notification;
import com.soict.smart_bin.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class NotificationService {
    private NotificationRepository repository;
    private final SimpMessagingTemplate messagingTemplate;

    public List<Notification> getNotifications(){
        return null;
    }

    public Long getUnreadCount(){
        return null;
    }

    public Long markAsRead(){
        return null;
    }

    public Long readAllNotification(){
        return null;
    }

    public void sendPrivateNotification(String userId, Object notificationPayload) {
        messagingTemplate.convertAndSendToUser(
                userId,
                "/queue/notifications",
                notificationPayload
        );
    }

    public void sendSystemBroadcast(Object notificationPayload) {
        messagingTemplate.convertAndSend("/topic/system-alerts", notificationPayload);
    }

}
