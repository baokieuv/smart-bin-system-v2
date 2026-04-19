package com.smart_bin.noti_service.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.smart_bin.core.common.EmailType;
import com.smart_bin.core.dto.EmailEventDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class KafkaService {

    private final EmailService emailService;

    @KafkaListener(topics = "${app.kafka.topics.send-email}", groupId = "${spring.kafka.consumer.group-id:notification-group}")
    public void consumeEmailEvent(EmailEventDto emailEventDto) {
        log.info("Nhận được yêu cầu gửi email. Loại: {}", emailEventDto.emailType());

        try {
            EmailType type = emailEventDto.emailType();
            JsonNode data = emailEventDto.data();

            // Lấy các trường dữ liệu chung
            String toEmail = data.get("email").asText();
            String firstName = data.has("fullName") ? data.get("fullName").asText() : "User";

            // Phân luồng logic gửi email dựa trên EmailType
            switch (type) {
                case VERIFICATION:
                    String activationCode = data.get("activationCode").asText();
                    emailService.sendVerificationEmail(toEmail, firstName, activationCode);
                    break;

                case WELCOME:
                    emailService.sendWelcomeEmail(toEmail, firstName);
                    break;

                case RESET_PASSWORD:
                    String resetToken = data.get("activationCode").asText();
                    emailService.sendPasswordResetEmail(toEmail, firstName, resetToken);
                    break;

                default:
                    log.warn("Không hỗ trợ loại email này: {}", type);
                    return; // Thoát nếu không hợp lệ
            }

            log.info("Xử lý gửi email {} thành công cho: {}", type, toEmail);

        } catch (Exception e) {
            log.error("Lỗi khi xử lý event gửi email: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to consume email event", e);
        }
    }
}