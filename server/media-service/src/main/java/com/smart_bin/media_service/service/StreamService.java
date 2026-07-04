package com.smart_bin.media_service.service;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.media_service.config.DeviceServiceClient;
import com.smart_bin.media_service.dto.request.RpcRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.FileSystemUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class StreamService {

    private final DeviceServiceClient deviceClient;

    private final Map<String, Set<String>> activeStreams = new ConcurrentHashMap<>();

    private final Map<String, Map<String, Long>> heartbeatTracker = new ConcurrentHashMap<>();

    private static final long TIMEOUT_THRESHOLD_MS = 15000;

    @Value("${stream.storage.path:D:/tmp/server/stream-data}")
    private String baseStreamPath;

    @Value("${device.internal-secret:SUPER_DEVICE_SECRET_INTERNAL_KEY}")
    private String deviceSecret;

    public void startViewingStream(String deviceMac, String userId, String tenantId) {
        deviceClient.verifyPermission(deviceSecret, deviceMac, tenantId);

        activeStreams.compute(deviceMac, (mac, viewers) -> {
            if (viewers == null || viewers.isEmpty()) {
                viewers = ConcurrentHashMap.newKeySet();
                deviceClient.deviceRPC(deviceSecret, mac, new RpcRequest("startStream", null));
            }
            viewers.add(userId);
            return viewers;
        });

        // Mark the stream start time
        updateStreamHeartbeat(deviceMac, userId);
    }

    public void stopViewingStream(String deviceMac, String userId, String tenantId) {
        // Verify permission (only for API calls with tenantId)
        deviceClient.verifyPermission(deviceSecret, deviceMac, tenantId);

        // Call the shared processing logic
        internalStopViewingStream(deviceMac, userId);
    }

    /**
     * Internal method used to handle stream stopping logic without verifyPermission.
     */
    private void internalStopViewingStream(String deviceMac, String userId) {
        activeStreams.computeIfPresent(deviceMac, (mac, viewers) -> {
            viewers.remove(userId);

            if (viewers.isEmpty()) {
                deviceClient.deviceRPC(deviceSecret, mac, new RpcRequest("stopStream", null));

                heartbeatTracker.remove(mac);
                clearStreamFiles(mac);

                return null; // Return null so the Map automatically removes this Key (deviceMac)
            }
            return viewers;
        });

        // Remove User from heartbeat tracker
        Map<String, Long> userHeartbeats = heartbeatTracker.get(deviceMac);
        if (userHeartbeats != null) {
            userHeartbeats.remove(userId);
        }
    }

    public void updateStreamHeartbeat(String deviceMac, String userId) {
        heartbeatTracker.computeIfAbsent(deviceMac, k -> new ConcurrentHashMap<>())
                .put(userId, System.currentTimeMillis());
    }

    public Resource getVideoFile(String deviceMac, String fileName) throws Exception {
        // Find file in directory: /tmp/stream-data/{deviceId}/{fileName}
        String sanitizedDeviceMac = deviceMac.replaceAll(":", "-");
        Path filePath = Paths.get(baseStreamPath, sanitizedDeviceMac, fileName).normalize();
        Resource resource = new UrlResource(filePath.toUri());

        if (resource.exists() && resource.isReadable()) {
            return resource;
        } else {
            throw new FileNotFoundException("Stream file not found: " + fileName);
        }
    }

    public void saveStreamFile(String deviceMac, MultipartFile file, String fileName){
        String sanitizedDeviceMac = deviceMac.replaceAll(":", "-");
        Path deviceDir = Paths.get(baseStreamPath, sanitizedDeviceMac).normalize();

        try {
            // Create directory if it does not exist
            if (!Files.exists(deviceDir)) {
                Files.createDirectories(deviceDir);
            }

            Path targetPath = deviceDir.resolve(fileName).normalize();

            // Overwrite the file
            Files.copy(file.getInputStream(), targetPath, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Cannot save stream file: " + e.getMessage());
        }
    }

    public void clearStreamFiles(String deviceMac) {
        try {
            String sanitizedDeviceMac = deviceMac.replaceAll(":", "-");
            Path deviceDir = Paths.get(baseStreamPath, sanitizedDeviceMac).normalize();
            if (Files.exists(deviceDir)) {
                // Delete the entire directory and the .ts, .m3u8 files inside
                FileSystemUtils.deleteRecursively(deviceDir);
                log.info("Cleaned up stream data for device: {}", deviceMac);
            }
        } catch (IOException e) {
            log.error("Error while cleaning up stream files for device {}: {}", deviceMac, e.getMessage());
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Cannot clean up stream files: " + e.getMessage());
        }
    }

    @Scheduled(fixedRate = 5000)
    public void scanForStreamTimeouts() {
        long now = System.currentTimeMillis();

        heartbeatTracker.forEach((deviceMac, users) -> {
            users.forEach((userId, lastBeat) -> {
                if (now - lastBeat > TIMEOUT_THRESHOLD_MS) {
                    log.warn("[TIMEOUT] Detected User {} disconnected / closed tab unexpectedly!", userId);
                    // Call internal method to bypass verifyPermission and handle Camera shutdown logic
                    internalStopViewingStream(deviceMac, userId);
                }
            });
        });
    }
}