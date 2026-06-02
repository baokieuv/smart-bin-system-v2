package com.smart_bin.device_service.config;

import com.smart_bin.device_service.dto.request.AlarmRuleDto;
import com.smart_bin.device_service.dto.request.CreateDeviceGroupRequest;
import com.smart_bin.device_service.repository.DeviceGroupRepository;
import com.smart_bin.device_service.service.DeviceGroupService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;

import static com.smart_bin.core.common.Constants.DEFAULT_GROUP_CODE;
import static com.smart_bin.core.common.Constants.DEFAULT_TENANT_ID;

@Component
@RequiredArgsConstructor
@Slf4j
public class DefaultDataInitializer {

    private final DeviceGroupRepository groupRepository;
    private final DeviceGroupService groupService;

    @EventListener(ApplicationReadyEvent.class)
    public void initDefaultDeviceGroup() {
        if (!groupRepository.existsByCodeAndActiveTrue(DEFAULT_GROUP_CODE)) {
            log.info("Đang khởi tạo Default Device Group...");

            List<AlarmRuleDto> defaultAlarms = List.of(
                    new AlarmRuleDto(
                            "HIGH_AVERAGE_WASTE", // alarmType
                            "GREATER_OR_EQUAL",   // operator
                            85.0,                 // threshold
                            "CRITICAL",           // severity
                            "LESS",               // clearOperator
                            70.0                  // clearThreshold
                    )
            );

            CreateDeviceGroupRequest request = new CreateDeviceGroupRequest(
                    DEFAULT_GROUP_CODE,
                    "Default Smart Bin Group",
                    new HashMap<>(), // sharedSpecs
                    "Nhóm thiết bị mặc định cho toàn hệ thống",
                    defaultAlarms
            );

            try {
                groupService.createDeviceGroup(request, DEFAULT_TENANT_ID);
                log.info("Đã tạo Default Device Group thành công!");
            } catch (Exception e) {
                log.error("Lỗi khi tạo Default Device Group: {}", e.getMessage());
            }
        } else {
            log.info("Default Device Group đã tồn tại.");
        }
    }
}