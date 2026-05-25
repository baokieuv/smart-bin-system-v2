package com.smart_bin.noti_service.service;

import com.smart_bin.core.common.NotificationType;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.noti_service.dto.request.MarkNotiRequest;
import com.smart_bin.noti_service.dto.response.NotificationDto;
import com.smart_bin.noti_service.entity.Notification;
import com.smart_bin.noti_service.exception.NotiErrorCode;
import com.smart_bin.noti_service.mapper.NotificationMapper;
import com.smart_bin.noti_service.repository.NotificationRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    private final NotificationRepository repository;
    private final NotificationMapper mapper;

    private final SimpMessagingTemplate messagingTemplate;

    public void createAndSendNotification(String keycloakId, String title, String message, NotificationType type){
        Notification notification = new Notification();
        notification.setKeycloakId(keycloakId);
        notification.setTitle(title);
        notification.setMessage(message);
        notification.setType(type);
        notification.setRead(false);

        Notification savedNotification = repository.save(notification);
        NotificationDto payload = mapper.toDto(savedNotification);

        sendPrivateNotification(keycloakId, payload);
        log.info("Sent real-time notification to user: {}", keycloakId);
    }

    public List<Notification> getNotifications(String keycloakId, Long page, Long size){
        long actualPage = (page != null && page > 0) ? page : 1L;
        long actualSize = (size != null && size > 0) ? size : 10L;

        int pageNumber = (int) (actualPage - 1);
        int pageSize = (int) actualSize;

        Pageable pageable = PageRequest.of(pageNumber, pageSize);

        return repository.findAllByKeycloakIdOrderByCreatedDateDesc(keycloakId, pageable);
    }

    public Long getUnreadCount(String keycloakId){
        return repository.countByKeycloakIdAndIsReadFalse(keycloakId);
    }

    public Long markAsRead(String keycloakId, Long id){
        Notification notification = repository.findById(id)
                .orElseThrow(() -> new ApiException(NotiErrorCode.NOTIFICATION_NOT_FOUND));

        if (!notification.getKeycloakId().equals(keycloakId)) {
            throw new ApiException(NotiErrorCode.NOTIFICATION_FORBIDDEN_ACCESS);
        }

        notification.setRead(true);
        repository.save(notification);
        return 1L;
    }

    @Transactional
    public Long readAllNotification(String keycloakId){
        // Update một phát ăn luôn qua JPQL
        repository.markAllAsReadByKeycloakId(keycloakId);
        return 1L;
    }

    @Transactional
    public Long markNotifications(MarkNotiRequest request, String keycloakId){
        repository.markNotifications(request.ids(), request.isRead(), keycloakId);
        return 1L;
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