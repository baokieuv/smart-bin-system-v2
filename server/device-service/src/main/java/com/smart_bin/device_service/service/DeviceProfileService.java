package com.smart_bin.device_service.service;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.device_service.dto.request.CreateDeviceProfileRequest;
import com.smart_bin.device_service.entity.DeviceProfile;
import com.smart_bin.device_service.exception.DeviceErrorCode;
import com.smart_bin.device_service.mapper.DeviceProfileMapper;
import com.smart_bin.device_service.repository.DeviceProfileRepository;
import com.smart_bin.device_service.repository.DeviceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DeviceProfileService {

    private final DeviceProfileRepository deviceProfileRepository;
    private final DeviceRepository deviceRepository;
    private final DeviceProfileMapper mapper;

    public List<DeviceProfile> getAllDeviceProfiles(Long page, Long size) {
        int pageIndex = (page != null && page > 0) ? page.intValue() - 1 : 0;
        int pageSize = (size != null && size > 0) ? size.intValue() : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        return deviceProfileRepository.findAll(pageable).getContent();
    }

    public DeviceProfile getDeviceProfileById(String id){
        UUID uuid = parseUUID(id);
        return deviceProfileRepository.findById(uuid)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_PROFILE_NOT_FOUND));
    }

    public DeviceProfile createDeviceProfile(CreateDeviceProfileRequest request){
        if (deviceProfileRepository.existsByCodeAndActiveTrue(request.code())){
            throw new ApiException(DeviceErrorCode.DEVICE_PROFILE_CODE_EXISTED);
        }

        DeviceProfile profile = mapper.toEntity(request);
        profile.setActive(true);

        return deviceProfileRepository.save(profile);
    }

    public DeviceProfile updateDeviceProfile(String id, CreateDeviceProfileRequest request){
        UUID uuid = parseUUID(id);
        DeviceProfile existingProfile = deviceProfileRepository.findById(uuid)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_PROFILE_NOT_FOUND));

        if (!existingProfile.getCode().equals(request.code()) &&
                deviceProfileRepository.existsByCode(request.code())) {
            throw new ApiException(DeviceErrorCode.DEVICE_PROFILE_CODE_EXISTED);
        }

        existingProfile.setName(request.name());
        existingProfile.setSharedSpecs(request.sharedSpecs());

        return deviceProfileRepository.save(existingProfile);
    }

    public String deleteDeviceProfile(String id){
        UUID uuid = parseUUID(id);
        DeviceProfile existingProfile = deviceProfileRepository.findById(uuid)
                .orElseThrow(() -> new ApiException(DeviceErrorCode.DEVICE_PROFILE_NOT_FOUND));

        if (deviceRepository.existsByDeviceProfile_IdAndActiveTrue(uuid)) {
            throw new ApiException(DeviceErrorCode.DEVICE_PROFILE_IN_USE);
        }

        existingProfile.setActive(false);
        deviceProfileRepository.save(existingProfile);
        return "Device profile deleted successfully";
    }

    private UUID parseUUID(String id) {
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            throw new ApiException(DeviceErrorCode.INVALID_ID_FORMAT);
        }
    }
}
