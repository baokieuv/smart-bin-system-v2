package com.smart_bin.device_service.service;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DeviceGroupService {

    private final DeviceGroupRepository repository;
    private final DeviceRepository deviceRepository;
    private final DeviceGroupMapper mapper;

    public Page<DeviceGroupResponse> getAllDeviceGroups(Long page, Long size) {
        int pageIndex = (page != null && page > 0) ? page.intValue() - 1 : 0;
        int pageSize = (size != null && size > 0) ? size.intValue() : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        return repository.findAllByActiveTrue(pageable).map(mapper::toResponse);
    }

    public DeviceGroupResponse getDeviceGroupById(String id) {
        return mapper.toResponse(findDeviceGroupById(id));
    }

    @Transactional
    public DeviceGroupResponse createDeviceGroup(CreateDeviceGroupRequest request) {
        if (repository.existsByCodeAndActiveTrue(request.code())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Mã nhóm thiết bị đã tồn tại");
        }

        DeviceGroup group = mapper.toEntity(request);
        group.setActive(true);
        return mapper.toResponse(repository.save(group));
    }

    @Transactional
    public DeviceGroupResponse updateDeviceGroup(String id, UpdateDeviceGroupRequest request) {
        DeviceGroup group = findDeviceGroupById(id);

        if (request.code() != null && repository.existsByCodeAndIdNotAndActiveTrue(request.code(), group.getId())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Mã nhóm thiết bị đã tồn tại");
        }

        mapper.updateDeviceGroupFromRequest(request, group);
        return mapper.toResponse(repository.save(group));
    }

    @Transactional
    public String deleteDeviceGroup(String id) {
        DeviceGroup group = findDeviceGroupById(id);

        // Không cho phép xóa nếu đang có thiết bị thực tế (Device) thuộc nhóm này
        if (deviceRepository.existsByDeviceGroup_IdAndActiveTrue(group.getId())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Không thể xóa. Đang có thiết bị hoạt động thuộc nhóm này.");
        }

        group.setActive(false);
        repository.save(group);

        return "Deleted device group successfully";
    }

    private DeviceGroup findDeviceGroupById(String id) {
        UUID groupId = parseUUID(id);
        return repository.findByIdAndActiveTrue(groupId)
                // Lưu ý: Bạn cần định nghĩa mã lỗi DEVICE_GROUP_NOT_FOUND trong DeviceErrorCode
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Không tìm thấy nhóm thiết bị"));
    }

    private UUID parseUUID(String id) {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Định dạng ID không hợp lệ");
        }
    }
}