package com.soict.smart_bin.service;

import com.soict.smart_bin.mapper.DeviceMapper;
import com.soict.smart_bin.repository.DeviceRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class DeviceService {

    private final DeviceRepository repository;
    private final DeviceMapper mapper;
    private final ThingsBoardService thingsBoardService;

    @Transactional
    public void addDevice(){
        thingsBoardService.addDevice();
    }

    public void updateDevice(){

    }

    public void deleteDevice(){

    }

    public void getTelemetries(){

    }

    public void getAttributes(){

    }
}
