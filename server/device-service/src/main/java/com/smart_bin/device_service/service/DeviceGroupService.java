package com.smart_bin.device_service.service;

import com.smart_bin.core.exception.ApiException;
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

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DeviceGroupService {

    private final DeviceGroupRepository repository;
    private final DeviceRepository deviceRepository;
    private final DeviceGroupMapper mapper;

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

        return mapper.toResponse(repository.save(group));
    }

    @Transactional
    public DeviceGroupResponse updateDeviceGroup(String id, UpdateDeviceGroupRequest request, String actorId) {
        DeviceGroup group = getGroupAndVerifyAccess(id, actorId);
        mapper.updateDeviceGroupFromRequest(request, group);
        return mapper.toResponse(repository.save(group));
    }

    @Transactional
    public String deleteDeviceGroup(String id, String actorId) {
        DeviceGroup group = getGroupAndVerifyAccess(id, actorId);

        if (deviceRepository.existsByDeviceGroup_IdAndActiveTrue(group.getId())) {
            throw new ApiException(DeviceErrorCode.DEVICE_GROUP_IN_USE);
        }
        group.setActive(false);
        repository.save(group);
        return "Deleted device group successfully";
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
}