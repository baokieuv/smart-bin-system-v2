package com.smart_bin.iam_service.serivce;

import com.fasterxml.jackson.databind.JsonNode;
import com.smart_bin.core.common.EmailType;
import com.smart_bin.core.dto.EmailEventDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class KafkaService {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${app.kafka.topics.send-email}")
    private String sendEmailTopic;

    public void sendEmailToUser(JsonNode data, EmailType emailType){
        EmailEventDto emailEventDto = new EmailEventDto(emailType, data);
        log.info("Đang yêu cầu gửi email lên topic [{}], Loại email: {}", sendEmailTopic, emailType);
        kafkaTemplate.send(sendEmailTopic, emailEventDto);
    }

    @KafkaListener(topics = "${app.kafka.topics.send-email}", groupId = "iam-service-group")
    public void consumeUserCreatedEvent(Object userDto) {
        log.info("Nhận được sự kiện tạo user mới: {}", userDto);
        // Xử lý logic...
    }
}
