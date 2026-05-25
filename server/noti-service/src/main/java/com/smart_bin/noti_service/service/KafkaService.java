package com.smart_bin.noti_service.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_bin.core.common.EmailType;
import com.smart_bin.core.dto.EmailEventDto;
import com.smart_bin.core.dto.NotificationEventDto;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.noti_service.exception.NotiErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class KafkaService {

    private final EmailService emailService;
    private final NotificationService notificationService;
    private final ObjectMapper objectMapper; // ✅ thêm

    @KafkaListener(topics = "${app.kafka.topics.send-email}", groupId = "${spring.kafka.consumer.group-id:notification-group}")
    public void consumeEmailEvent(@Payload Map<String, Object> raw) { // ✅ thêm @Payload + dùng Map
        try {
            EmailEventDto emailEventDto = objectMapper.convertValue(raw, EmailEventDto.class);

            log.info("Nhận được yêu cầu gửi email. Loại: {}", emailEventDto.emailType());

            EmailType type = emailEventDto.emailType();
            Map<String, Object> data = emailEventDto.data();

            String toEmail = data.get("email").toString();
            String firstName = data.containsKey("fullName") ? data.get("fullName").toString() : "User";
            String password = data.containsKey("password") ? data.get("password").toString() : null;

            switch (type) {
                case VERIFICATION:
                    emailService.sendVerificationEmail(toEmail, firstName, data.get("activationCode").toString());
                    break;
                case WELCOME:
                    emailService.sendWelcomeEmail(toEmail, firstName);
                    break;
                case RESET_PASSWORD:
                    emailService.sendPasswordResetEmail(toEmail, firstName, data.get("activationCode").toString());
                    break;
                case WELCOME_TENANT:
                    emailService.sendWelcomeTenantEmail(toEmail, firstName, password);
                    break;
                default:
                    log.warn("Không hỗ trợ loại email này: {}", type);
                    return;
            }

            log.info("Xử lý gửi email {} thành công cho: {}", type, toEmail);

        } catch (Exception e) {
            log.error("Lỗi khi xử lý event gửi email: {}", e.getMessage(), e);
            throw new ApiException(NotiErrorCode.KAFKA_EMAIL_CONSUME_FAILED);
        }
    }

    @KafkaListener(topics = "${app.kafka.topics.send-noti}", groupId = "${spring.kafka.consumer.group-id:notification-group}")
    public void consumeNotificationEvent(@Payload Map<String, Object> raw) { // ✅ thêm @Payload
        try {
            NotificationEventDto dto = objectMapper.convertValue(raw, NotificationEventDto.class);
            log.info("Nhận được yêu cầu gửi thông báo. Loại: {}", dto.type());
            notificationService.createAndSendNotification(dto.keycloakId(), dto.title(), dto.message(), dto.type());
        } catch (Exception e) {
            log.error("Lỗi khi xử lý event gửi thông báo: {}", e.getMessage(), e);
            throw new ApiException(NotiErrorCode.KAFKA_NOTI_CONSUME_FAILED);
        }
    }
}