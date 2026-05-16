package com.smart_bin.iam_service.serivce;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_bin.core.common.EmailType;
import com.smart_bin.core.dto.EmailEventDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class KafkaService {

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Value("${app.kafka.topics.send-email}")
    private String sendEmailTopic;

    public void sendEmailToUser(JsonNode data, EmailType emailType){
//        EmailEventDto emailEventDto = new EmailEventDto(emailType, data);
        log.info("Đang yêu cầu gửi email lên topic [{}], Loại email: {}", sendEmailTopic, emailType);
        Map<String, Object> dataMap = objectMapper.convertValue(data, new TypeReference<>() {});
        EmailEventDto dto = new EmailEventDto(emailType, dataMap);
        kafkaTemplate.send(sendEmailTopic, dto);
    }
}
