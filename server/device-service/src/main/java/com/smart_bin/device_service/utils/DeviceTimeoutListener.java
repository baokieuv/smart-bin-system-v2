package com.smart_bin.device_service.utils;

import com.smart_bin.core.common.Constants;
import com.smart_bin.device_service.service.DeviceService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.listener.KeyExpirationEventMessageListener;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class DeviceTimeoutListener extends KeyExpirationEventMessageListener {
    private final DeviceService deviceService;

    public DeviceTimeoutListener(RedisMessageListenerContainer listenerContainer, DeviceService deviceService) {
        super(listenerContainer);

        this.deviceService = deviceService;
    }

    @Override
    public void onMessage(Message message, byte[] pattern){
        String expiredKey = message.toString();

        if (expiredKey.startsWith(Constants.PENDING_DEVICE_PREFIX)) {
            // Extract the deviceId from the key
            String[] parts = expiredKey.split(":");

            // Safety check to ensure the key is perfectly formatted
            if (parts.length == 3) {
                String userId = parts[1];
                String deviceId = parts[2];

                // Execute database update
                 deviceService.deleteDevice(deviceId, userId);
            } else {
                log.error("Malformed Redis key expired: {}", expiredKey);
            }
        }
    }
}
