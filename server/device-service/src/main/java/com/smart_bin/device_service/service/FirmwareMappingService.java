package com.smart_bin.device_service.service;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.device_service.dto.request.CreateFirmwareMappingRequest;
import com.smart_bin.device_service.dto.request.UpdateFirmwareMappingRequest;
import com.smart_bin.device_service.dto.response.FirmwareMappingResponse;
import com.smart_bin.device_service.entity.Firmware;
import com.smart_bin.device_service.entity.FirmwareMapping;
import com.smart_bin.device_service.mapper.FirmwareMappingMapper;
import com.smart_bin.device_service.repository.FirmwareMappingRepository;
import com.smart_bin.device_service.repository.FirmwareRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FirmwareMappingService {

    private final FirmwareMappingRepository mappingRepository;
    private final FirmwareRepository firmwareRepository;
    private final FirmwareMappingMapper mapper;
    private final DeviceService deviceService;

    @Transactional
    public FirmwareMappingResponse createMapping(CreateFirmwareMappingRequest request) {
        Firmware targetFw = firmwareRepository.findById(UUID.fromString(request.targetFirmwareId()))
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Firmware đích không tồn tại"));

        FirmwareMapping mapping = new FirmwareMapping();
        mapping.setMetadataCriteria(request.metadataCriteria());
        mapping.setTargetFirmware(targetFw);
        mapping.setPriority(request.priority() != null ? request.priority() : 0);
        mapping.setActive(true);

        FirmwareMapping savedMapping = mappingRepository.save(mapping);

        deviceService.applyFirmwareMappingToExistingDevices(savedMapping);

        return mapper.toResponse(savedMapping);
    }

    public Page<FirmwareMappingResponse> getMappings(int page, int size) {
        int pageIndex = (page > 0) ? page - 1 : 0;
        return mappingRepository.findAllByActiveTrueOrderByPriorityDesc(PageRequest.of(pageIndex, size))
                .map(mapper::toResponse);
    }

    public FirmwareMappingResponse getMappingById(String id) {
        FirmwareMapping mapping = mappingRepository.findByIdAndActiveTrue(UUID.fromString(id))
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Không tìm thấy cấu hình"));
        return mapper.toResponse(mapping);
    }

    @Transactional
    public FirmwareMappingResponse updateMapping(String id, UpdateFirmwareMappingRequest request) {
        FirmwareMapping mapping = mappingRepository.findByIdAndActiveTrue(UUID.fromString(id))
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Không tìm thấy cấu hình"));

        if (request.metadataCriteria() != null && !request.metadataCriteria().isEmpty()) {
            mapping.setMetadataCriteria(request.metadataCriteria());
        }

        if (request.targetFirmwareId() != null && !request.targetFirmwareId().isBlank()) {
            Firmware targetFw = firmwareRepository.findById(UUID.fromString(request.targetFirmwareId()))
                    .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Firmware đích không tồn tại"));
            mapping.setTargetFirmware(targetFw);
        }

        if (request.priority() != null) {
            mapping.setPriority(request.priority());
        }

        FirmwareMapping savedMapping = mappingRepository.save(mapping);

        deviceService.applyFirmwareMappingToExistingDevices(savedMapping);

        return mapper.toResponse(savedMapping);
    }

    @Transactional
    public void deleteMapping(String id) {
        FirmwareMapping mapping = mappingRepository.findById(UUID.fromString(id))
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Không tìm thấy cấu hình"));

        mapping.setActive(false); // Xóa mềm
        mappingRepository.save(mapping);
    }
}