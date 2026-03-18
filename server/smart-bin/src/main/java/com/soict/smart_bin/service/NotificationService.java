package com.soict.smart_bin.service;

import com.soict.smart_bin.common.NotificationType;
import com.soict.smart_bin.dto.notification.NotificationDto;
import com.soict.smart_bin.entity.Notification;
import com.soict.smart_bin.entity.User;
import com.soict.smart_bin.exception.ApiException;
import com.soict.smart_bin.exception.CoreErrorCode;
import com.soict.smart_bin.exception.UserErrorCode;
import com.soict.smart_bin.mapper.NotificationMapper;
import com.soict.smart_bin.repository.NotificationRepository;
import com.soict.smart_bin.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {
    private final NotificationRepository repository;
    private final SimpMessagingTemplate messagingTemplate;
    private final UserRepository userRepository;
    private final NotificationMapper mapper;


    public void createAndSendNotification(User user, String title, String message, NotificationType type){
        Notification notification = new Notification();
        notification.setUser(user);
        notification.setTitle(title);
        notification.setMessage(message);
        notification.setType(type);
        notification.setRead(false);

        Notification savedNotification = repository.save(notification);

        NotificationDto payload = mapper.toDto(savedNotification);

        sendPrivateNotification(user.getKeycloakId(), payload);
        log.info("Sent real-time notification to user: {}", user.getKeycloakId());
    }

    public List<Notification> getNotifications(String keycloakId, Long page, Long size){
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId).orElseThrow(
                () -> new ApiException(UserErrorCode.USER_NOT_FOUND)
        );

        return repository.findAllByUserOrderByCreatedDateDesc(user);
    }

    public Long getUnreadCount(String keycloakId){
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId).orElseThrow(
                () -> new ApiException(UserErrorCode.USER_NOT_FOUND)
        );
        return repository.countByUserAndIsReadFalse(user);
    }

    public Long markAsRead(String keycloakId, Long id){
        Notification notification = repository.findById(id).orElseThrow(
                () -> new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR)
        );
        notification.setRead(true);
        repository.save(notification);
        return 1L;
    }

    public Long readAllNotification(String keycloakId){
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId).orElseThrow(
                () -> new ApiException(UserErrorCode.USER_NOT_FOUND)
        );
        repository.markAllAsReadByUser(user);
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
