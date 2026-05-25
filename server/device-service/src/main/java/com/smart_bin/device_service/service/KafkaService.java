package com.smart_bin.device_service.service;

import com.smart_bin.core.dto.NotificationEventDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

@Component
@RequiredArgsConstructor
@Slf4j
public class KafkaService {
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${app.kafka.topics.send-noti}")
    private String notiTopic;

    public void publishNotification(NotificationEventDto eventPayload) {
        log.info("Đang gửi thông báo [{}]: {}", eventPayload.type(), eventPayload.title());

        CompletableFuture<SendResult<String, Object>> future = kafkaTemplate.send(notiTopic, eventPayload);

        future.whenComplete((result, ex) -> {
            if (ex == null) {
                log.info("Gửi thông báo thành công lên Kafka. Topic: {}, Partition: {}, Offset: {}",
                        result.getRecordMetadata().topic(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
            } else {
                log.error("Lỗi khi gửi thông báo [{}]: {}. Nguyên nhân: {}",
                        eventPayload.type(), eventPayload.title(), ex.getMessage(), ex);
            }
        });
    }
}
