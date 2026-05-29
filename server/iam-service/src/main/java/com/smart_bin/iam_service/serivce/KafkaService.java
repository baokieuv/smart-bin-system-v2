package com.smart_bin.iam_service.serivce;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_bin.core.common.EmailType;
import com.smart_bin.core.common.SyncTenantUserType;
import com.smart_bin.core.dto.EmailEventDto;
import com.smart_bin.core.dto.NotificationEventDto;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.iam_service.common.UserState;
import com.smart_bin.iam_service.entity.Tenant;
import com.smart_bin.iam_service.entity.TenantUserControl;
import com.smart_bin.iam_service.entity.User;
import com.smart_bin.iam_service.exception.UserErrorCode;
import com.smart_bin.iam_service.repository.TenantRepository;
import com.smart_bin.iam_service.repository.TenantUserControlRepository;
import com.smart_bin.iam_service.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Service
@RequiredArgsConstructor
@Slf4j
public class KafkaService {

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final TenantUserControlRepository tenantUserControlRepository;

    @Value("${app.kafka.topics.send-email}")
    private String sendEmailTopic;

    public void sendEmailToUser(JsonNode data, EmailType emailType){
        log.info("Đang yêu cầu gửi email lên topic [{}], Loại email: {}", sendEmailTopic, emailType);

        Map<String, Object> dataMap = objectMapper.convertValue(data, new TypeReference<>() {});
        EmailEventDto dto = new EmailEventDto(emailType, dataMap);

        CompletableFuture<SendResult<String, Object>> future = kafkaTemplate.send(sendEmailTopic, dto);

        future.whenComplete((result, ex) -> {
            if (ex == null) {
                log.info("Yêu cầu gửi email thành công lên Kafka. Topic: {}, Partition: {}, Offset: {}",
                        result.getRecordMetadata().topic(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
            } else {
                log.error("Lỗi khi đẩy yêu cầu gửi email [{}] lên Kafka. Nguyên nhân: {}",
                        emailType, ex.getMessage(), ex);
            }
        });
    }

    @KafkaListener(topics = "${app.kafka.topics.sync-user-tenant}", groupId = "${spring.kafka.consumer.group-id:iam-group}")
    public void consumeUserTenantSyncEvent(@Payload Map<String, Object> raw) {
        try {
            String userId = raw.get("userId").toString();
            String tenantId = raw.get("tenantId").toString();
            String action = raw.get("action").toString().trim();

            mappingTenantAndUser(tenantId, userId, SyncTenantUserType.valueOf(action));
            log.info("Nhận được yêu cầu mapping tenant - user: {} - {} -> {}", tenantId, userId, action);
        } catch (Exception e) {
            log.error("Lỗi khi xử lý event gửi thông báo: {}", e.getMessage(), e);
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    @Transactional
    public void mappingTenantAndUser(String tenantId, String userId, SyncTenantUserType action) {
        Tenant tenant = tenantRepository.findByKeycloakId(tenantId)
                .orElseThrow(() -> new ApiException(UserErrorCode.TENANT_NOT_FOUND));

        User user = userRepository.findByKeycloakId(userId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        Optional<TenantUserControl> existingRecordOpt = tenantUserControlRepository
                .findByTenantIdAndUserId(tenant.getId(), user.getId());

        switch (action) {
            case ADDING:
                if (existingRecordOpt.isPresent()) {
                    TenantUserControl record = existingRecordOpt.get();
                    if (!record.isActive()) {
                        record.setActive(true);
                        tenantUserControlRepository.save(record);
                        log.info("Kích hoạt lại (ACTIVE) mapping cho User {} trong Tenant {}", userId, tenantId);
                    } else {
                        log.warn("User {} đã ACTIVE sẵn trong Tenant {}. Bỏ qua yêu cầu ADD.", userId, tenantId);
                    }
                } else {
                    TenantUserControl controlRecord = new TenantUserControl();
                    controlRecord.setTenantId(tenant.getId());
                    controlRecord.setUserId(user.getId());
                    controlRecord.setState(UserState.ACTIVE);
                    tenantUserControlRepository.save(controlRecord);
                    log.info("Tạo mới mapping User {} vào Tenant {} thành công", userId, tenantId);
                }
                break;

            case REMOVE:
                if (existingRecordOpt.isPresent()) {
                    TenantUserControl record = existingRecordOpt.get();
                    if (record.isActive()) {
                        record.setActive(false);
                        tenantUserControlRepository.save(record);
                        log.info("Đã vô hiệu hóa (INACTIVE) mapping User {} khỏi Tenant {}", userId, tenantId);
                    } else {
                        log.warn("User {} đã bị vô hiệu hóa sẵn trong Tenant {}. Bỏ qua yêu cầu REMOVE.", userId, tenantId);
                    }
                } else {
                    log.warn("Không tìm thấy mapping giữa User {} và Tenant {} để vô hiệu hóa. Bỏ qua.", userId, tenantId);
                }
                break;

            default:
                log.error("Action không hợp lệ từ Kafka: {}", action);
                throw new ApiException(CoreErrorCode.BAD_REQUEST, "Action không được hỗ trợ: " + action);
        }
    }
}
