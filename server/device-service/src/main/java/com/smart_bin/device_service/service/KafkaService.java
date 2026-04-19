package com.smart_bin.device_service.service;

import com.smart_bin.core.dto.NotificationEventDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class KafkaService {
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${app.kafka.topics.send-noti}")
    private String notiTopic;

    public void publishNotification(NotificationEventDto eventPayload) {
        log.info("Đang gửi thông báo [{}]: {}", eventPayload.type(), eventPayload.title());
        kafkaTemplate.send(notiTopic, eventPayload);
    }
}
