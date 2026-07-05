package com.smart_bin.media_service.service;

import com.smart_bin.media_service.config.DeviceServiceClient;
import com.smart_bin.media_service.dto.request.RpcRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class StreamService {

    private final DeviceServiceClient deviceClient;

    // Quản lý danh sách người dùng đang xem của mỗi thiết bị (Key: deviceMac, Value: Set of userIds)
    private final Map<String, Set<String>> activeStreams = new ConcurrentHashMap<>();

    // Theo dõi heartbeat của người dùng để đóng luồng nếu họ bị ngắt kết nối đột ngột
    private final Map<String, Map<String, Long>> heartbeatTracker = new ConcurrentHashMap<>();

    // Danh sách các thiết bị ĐÃ XÁC NHẬN khởi tạo luồng thành công
    private final Set<String> streamingDevices = ConcurrentHashMap.newKeySet();

    private static final long TIMEOUT_THRESHOLD_MS = 15000;

    @Value("${device.internal-secret:SUPER_DEVICE_SECRET_INTERNAL_KEY}")
    private String deviceSecret;

    @Value("${webrtc.server.url:http://localhost:8889}")
    private String webrtcServerUrl;

    /**
     * Client gọi để lấy URL WebRTC và bắt đầu phiên xem.
     */
    public String startViewingStream(String deviceMac, String userId, String tenantId) {
        // 1. Kiểm tra quyền của người dùng với thiết bị
        deviceClient.verifyPermission(deviceSecret, deviceMac, tenantId);

        // 2. Xử lý logic tạo luồng
        activeStreams.compute(deviceMac, (mac, viewers) -> {
            if (viewers == null || viewers.isEmpty()) {
                viewers = ConcurrentHashMap.newKeySet();
                log.info("First viewer ({}). Sending RPC to device {} to START stream", userId, mac);
                // Gửi lệnh RPC yêu cầu thiết bị mở luồng camera
                deviceClient.deviceRPC(deviceSecret, mac, new RpcRequest("startStream", null));
            } else {
                log.info("Stream already requested for device {}. Adding viewer ({}).", mac, userId);
            }
            viewers.add(userId);
            return viewers;
        });

        // 3. Đánh dấu heartbeat cho User
        updateStreamHeartbeat(deviceMac, userId);

        // 4. Trả về URL Signaling cho WebRTC
        return getWebRtcSignalingAddress(deviceMac);
    }

    /**
     * Sinh URL Signaling cho WebRTC dựa trên MAC thiết bị
     */
    private String getWebRtcSignalingAddress(String deviceMac) {
        String streamName = deviceMac.replaceAll(":", "-");
        return String.format("%s/%s/whep", webrtcServerUrl, streamName);
    }

    /**
     * API dành cho Thiết bị gọi lên khi đã đẩy luồng thành công
     */
    public void onDeviceStreamStarted(String deviceMac) {
        streamingDevices.add(deviceMac);
        log.info("Device {} confirmed stream is LIVE and pushing to Media Server.", deviceMac);
    }

    /**
     * Kiểm tra xem thiết bị đã thực sự đẩy luồng lên Media Server chưa
     */
    public boolean isDeviceStreamReady(String deviceMac) {
        return streamingDevices.contains(deviceMac);
    }

    /**
     * Client chủ động gọi khi dừng xem luồng
     */
    public void stopViewingStream(String deviceMac, String userId, String tenantId) {
        deviceClient.verifyPermission(deviceSecret, deviceMac, tenantId);
        internalStopViewingStream(deviceMac, userId);
    }

    /**
     * Cập nhật thời gian sống (heartbeat) của user đang xem
     */
    public void updateStreamHeartbeat(String deviceMac, String userId) {
        heartbeatTracker.computeIfAbsent(deviceMac, k -> new ConcurrentHashMap<>())
                .put(userId, System.currentTimeMillis());
    }

    /**
     * Xử lý logic nội bộ để dừng luồng và dọn dẹp biến trên RAM
     */
    private void internalStopViewingStream(String deviceMac, String userId) {
        activeStreams.computeIfPresent(deviceMac, (mac, viewers) -> {
            viewers.remove(userId);

            if (viewers.isEmpty()) {
                log.info("No viewers left for device {}. Sending RPC to STOP stream", mac);
                // Không còn ai xem -> Bắn RPC yêu cầu thiết bị tắt camera
                deviceClient.deviceRPC(deviceSecret, mac, new RpcRequest("stopStream", null));

                // Dọn dẹp dữ liệu bộ nhớ
                heartbeatTracker.remove(mac);
                streamingDevices.remove(mac);

                return null; // Tự động xóa key `deviceMac` khỏi Map
            }
            return viewers;
        });

        // Xóa User khỏi heartbeat tracker
        Map<String, Long> userHeartbeats = heartbeatTracker.get(deviceMac);
        if (userHeartbeats != null) {
            userHeartbeats.remove(userId);
        }
    }

    /**
     * Quét định kỳ 5s/lần để đóng các luồng mà user bị mất kết nối (rớt mạng/đóng tab đột ngột)
     */
    @Scheduled(fixedRate = 5000)
    public void scanForStreamTimeouts() {
        long now = System.currentTimeMillis();

        heartbeatTracker.forEach((deviceMac, users) -> {
            users.forEach((userId, lastBeat) -> {
                if (now - lastBeat > TIMEOUT_THRESHOLD_MS) {
                    log.warn("[TIMEOUT] Detected User {} disconnected / closed tab unexpectedly!", userId);
                    internalStopViewingStream(deviceMac, userId);
                }
            });
        });
    }
}