package com.smart_bin.device_service.service;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.device_service.dto.request.AlarmRuleDto;
import com.smart_bin.device_service.dto.request.CreateDeviceGroupRequest;
import com.smart_bin.device_service.dto.request.UpdateDeviceGroupRequest;
import com.smart_bin.device_service.dto.response.DeviceGroupResponse;
import com.smart_bin.device_service.entity.DeviceGroup;
import com.smart_bin.device_service.exception.DeviceErrorCode;
import com.smart_bin.device_service.mapper.DeviceGroupMapper;
import com.smart_bin.device_service.repository.DeviceGroupRepository;
import com.smart_bin.device_service.repository.DeviceRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DeviceGroupService {

    private final DeviceGroupRepository repository;
    private final DeviceRepository deviceRepository;
    private final ThingsBoardService thingsBoardService;
    private final DeviceGroupMapper mapper;
    private final ObjectMapper objectMapper;

    public List<DeviceGroupResponse> getAllDeviceGroups(Long page, Long size, String actorId) {
        int pageIndex = (page != null && page > 0) ? page.intValue() - 1 : 0;
        int pageSize = (size != null && size > 0) ? size.intValue() : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        return repository.findAllByTenantIdAndActiveTrue(actorId, pageable).stream()
                .map(mapper::toResponse)
                .collect(Collectors.toList());
    }

    public DeviceGroupResponse getDeviceGroupById(String id, String actorId) {
        return mapper.toResponse(getGroupAndVerifyAccess(id, actorId));
    }

    @Transactional
    public DeviceGroupResponse createDeviceGroup(CreateDeviceGroupRequest request, String actorId) {
        if (repository.existsByCodeAndActiveTrue(request.code())) {
            throw new ApiException(DeviceErrorCode.DEVICE_GROUP_CODE_EXISTED);
        }

        DeviceGroup group = mapper.toEntity(request);
        group.setTenantId(actorId);
        group.setActive(true);

        JsonNode tbProfileResponse = thingsBoardService.addDeviceProfile(request.name(), request.description());

        if (tbProfileResponse != null && tbProfileResponse.has("id")) {
            String tbProfileId = tbProfileResponse.get("id").get("id").asString();
            group.setTbProfileId(tbProfileId); // Lưu ID vào Database

            if (request.alarmRules() != null && !request.alarmRules().isEmpty()) {
                JsonNode tbAlarmConfig = buildThingsBoardAlarmConfig(request.alarmRules());
                thingsBoardService.configAlarmRules(tbProfileId, tbAlarmConfig);
            }
        } else {
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Không thể tạo Profile trên ThingsBoard");
        }

        return mapper.toResponse(repository.save(group));
    }

    @Transactional
    public DeviceGroupResponse updateDeviceGroup(String id, UpdateDeviceGroupRequest request, String actorId) {
        DeviceGroup group = getGroupAndVerifyAccess(id, actorId);
        mapper.updateDeviceGroupFromRequest(request, group);

        if (request.alarmRules() != null) {
            JsonNode tbAlarmConfig = buildThingsBoardAlarmConfig(request.alarmRules());
            thingsBoardService.configAlarmRules(group.getTbProfileId(), tbAlarmConfig);
        }

        return mapper.toResponse(repository.save(group));
    }

    @Transactional
    public String deleteDeviceGroup(String id, String actorId) {
        DeviceGroup group = getGroupAndVerifyAccess(id, actorId);

        if (deviceRepository.existsByDeviceGroup_IdAndActiveTrue(group.getId())) {
            throw new ApiException(DeviceErrorCode.DEVICE_GROUP_IN_USE);
        }

        if (group.isDefault()) {
            throw new ApiException(DeviceErrorCode.DEVICE_FORBIDDEN_ACCESS, "Không thể xóa nhóm thiết bị mặc định của hệ thống.");
        }

        String tbProfileId = group.getTbProfileId();

        group.setTbProfileId(null);
        group.setActive(false);
        repository.save(group);

        thingsBoardService.deleteDeviceProfile(tbProfileId);
        return "Deleted device group successfully";
    }

    @Transactional
    public DeviceGroup getOrCreateDefaultGroupForTenant(String tenantId) {
        return repository.findByTenantIdAndIsDefaultTrueAndActiveTrue(tenantId)
                .orElseGet(() -> {
                    DeviceGroup defaultGroup = new DeviceGroup();
                    defaultGroup.setTenantId(tenantId);
                    defaultGroup.setCode("DEFAULT_GRP_" + tenantId.substring(0, 8).toUpperCase());
                    defaultGroup.setName("Default Group");
                    defaultGroup.setDescription("Nhóm thiết bị mặc định của hệ thống. Không thể xóa.");
                    defaultGroup.setActive(true);
                    defaultGroup.setDefault(true);

                    // Khởi tạo Profile mặc định trên ThingsBoard
                    JsonNode tbProfileResponse = thingsBoardService.addDeviceProfile(defaultGroup.getName(), defaultGroup.getDescription());

                    List<AlarmRuleDto> defaultAlarms = List.of(
                            new AlarmRuleDto(
                                    "BIN_FULL_ALARM",     // alarmType mới
                                    "LESS_OR_EQUAL",      // operator: Khoảng cách NHỎ HƠN HOẶC BẰNG
                                    3.0,                 // threshold: 3cm là báo đầy
                                    "CRITICAL",           // severity
                                    "GREATER",            // clearOperator: Khoảng cách LỚN HƠN thì xóa cảnh báo
                                    6.0                  // clearThreshold: > 6cm thì hết cảnh báo
                            )
                    );

                    if (tbProfileResponse != null && tbProfileResponse.has("id")) {
                        defaultGroup.setTbProfileId(tbProfileResponse.get("id").get("id").asString());
                        JsonNode tbAlarmConfig = buildThingsBoardAlarmConfig(defaultAlarms);
                        thingsBoardService.configAlarmRules(defaultGroup.getTbProfileId(), tbAlarmConfig);
                    } else {
                        throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Không thể tạo Default Profile trên ThingsBoard");
                    }

                    return repository.save(defaultGroup);
                });
    }

    private DeviceGroup getGroupAndVerifyAccess(String id, String actorId) {
        try {
            UUID groupId = UUID.fromString(id);
            DeviceGroup group = repository.findByIdAndActiveTrue(groupId)
                    .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_GROUP_NOT_FOUND));

            if (!group.getTenantId().equals(actorId)) {
                throw new ApiException(DeviceErrorCode.DEVICE_FORBIDDEN_ACCESS);
            }
            return group;
        } catch (IllegalArgumentException e) {
            throw new ApiException(DeviceErrorCode.INVALID_ID_FORMAT);
        }
    }

    private JsonNode buildThingsBoardAlarmConfig(List<AlarmRuleDto> rules) {
        ArrayNode alarmsArray = objectMapper.createArrayNode();

        if (rules == null || rules.isEmpty()) {
            return alarmsArray;
        }

        for (AlarmRuleDto rule : rules) {
            ObjectNode alarmRule = objectMapper.createObjectNode();

            // 1. Basic properties
            alarmRule.put("id", rule.alarmType().toLowerCase());
            alarmRule.put("alarmType", rule.alarmType());

            // 2. createRules object
            ObjectNode createRules = alarmRule.putObject("createRules");
            ObjectNode severityNode = createRules.putObject(rule.severity());

            // Mặc định cho phép rule chạy mọi lúc
            severityNode.putObject("schedule").put("type", "ANY_TIME");

            ObjectNode conditionWrapper = severityNode.putObject("condition");
            ArrayNode conditionArray = conditionWrapper.putArray("condition");

            // 3. Condition details
            ObjectNode conditionNode = objectMapper.createObjectNode();

            ObjectNode keyNode = conditionNode.putObject("key");
            keyNode.put("type", "TIME_SERIES");

            String telemetryKey = rule.alarmType().equalsIgnoreCase("BIN_FULL_ALARM")
                    ? "min_distance"
                    : rule.alarmType().toLowerCase();
            keyNode.put("key", telemetryKey);

            conditionNode.put("valueType", "NUMERIC");

            ObjectNode predicate = conditionNode.putObject("predicate");
            predicate.put("type", "NUMERIC");
            predicate.put("operation", rule.operator());

            ObjectNode valueNode = predicate.putObject("value");
            valueNode.put("type", "DYNAMIC");
            ObjectNode dynamicValueNode = valueNode.putObject("dynamicValue");
            dynamicValueNode.put("sourceType", "CURRENT_DEVICE");

            String thresholdAttribute = "max_" + rule.alarmType().toLowerCase() + "_threshold";
            dynamicValueNode.put("sourceAttribute", thresholdAttribute);
            dynamicValueNode.put("inherit", false);

            conditionArray.add(conditionNode);

            // 4. Clear Rule
            if (rule.clearOperator() != null && rule.clearThreshold() != null) {
                ObjectNode clearRule = alarmRule.putObject("clearRule");

                clearRule.putObject("schedule").put("type", "ANY_TIME");

                ObjectNode clearConditionWrapper = clearRule.putObject("condition");
                ArrayNode clearConditionArray = clearConditionWrapper.putArray("condition");

                ObjectNode clearConditionNode = objectMapper.createObjectNode();

                ObjectNode clearKeyNode = clearConditionNode.putObject("key");
                clearKeyNode.put("type", "TIME_SERIES");
                clearKeyNode.put("key", telemetryKey);

                clearConditionNode.put("valueType", "NUMERIC");

                ObjectNode clearPredicate = clearConditionNode.putObject("predicate");
                clearPredicate.put("type", "NUMERIC");
                clearPredicate.put("operation", rule.clearOperator());

                ObjectNode clearValueNode = clearPredicate.putObject("value");
                clearValueNode.put("type", "DYNAMIC");
                ObjectNode clearDynamicValueNode = clearValueNode.putObject("dynamicValue");
                clearDynamicValueNode.put("sourceType", "CURRENT_DEVICE");
                String clearThresholdAttribute = "clear_" + rule.alarmType().toLowerCase() + "_threshold";
                clearDynamicValueNode.put("sourceAttribute", clearThresholdAttribute);
                clearDynamicValueNode.put("inherit", false);

                clearConditionArray.add(clearConditionNode);
            }

            // 5. Các setting bổ sung
            alarmRule.put("propagate", false);

            alarmsArray.add(alarmRule);
        }

        return alarmsArray;
    }
}