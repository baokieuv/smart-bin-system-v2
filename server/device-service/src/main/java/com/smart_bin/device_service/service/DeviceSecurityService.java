package com.smart_bin.device_service.service;

import com.nimbusds.jose.shaded.gson.JsonObject;
import com.nimbusds.jose.shaded.gson.JsonParser;
import org.springframework.core.io.Resource;
import com.smart_bin.core.common.Constants;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.device_service.utils.PemUtils;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;

@Service
@Slf4j
public class DeviceSecurityService {
    private PrivateKey serverPrivateKey;

    @Value("classpath:private_key.pem")
    private Resource privateKeyResource;

    @PostConstruct
    public void init() {
        try {
            String path = privateKeyResource.getFile().getAbsolutePath();
            this.serverPrivateKey = PemUtils.getPrivateKey(path);
        } catch (Exception e) {
            log.error("Failed to load RSA Private Key of Server", e);
        }
    }

    // 1. Chỉ parse JSON để lấy thông tin cơ bản
    public JsonObject parsePayloadAndCheckTimestamp(String payload) {
        try {
            JsonObject obj = JsonParser.parseString(payload).getAsJsonObject();
            long timestamp = obj.get("timestamp").getAsLong();
            long now = Instant.now().toEpochMilli();

            if (now - timestamp > Constants.TIMESTAMP_EXPIRY) {
                throw new ApiException(CoreErrorCode.VALIDATION_SIGNATURE_ERROR, "Payload has expired");
            }
            return obj;
        } catch (Exception e) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid payload format");
        }
    }

    // 2. Xác thực thiết bị: Dùng Public Key CỦA THIẾT BỊ để verify signature thiết bị gửi lên
    public void verifySignatureWithDeviceKey(String payload, String signature, String devicePublicKeyPem) {
        try {
            PublicKey deviceKey = PemUtils.getPublicKeyFromString(devicePublicKeyPem);
            byte[] digitalSignature = Base64.getDecoder().decode(signature);

            Signature verify = Signature.getInstance("SHA256withRSA");
            verify.initVerify(deviceKey);
            verify.update(payload.getBytes(StandardCharsets.UTF_8));

            if (!verify.verify(digitalSignature)) {
                throw new ApiException(CoreErrorCode.VALIDATION_SIGNATURE_ERROR, "Invalid signature from device");
            }
        } catch (Exception e) {
            log.error("Verification error: ", e);
            throw new ApiException(CoreErrorCode.VALIDATION_SIGNATURE_ERROR, "Signature verification failed");
        }
    }

    // 3. Xác thực Server: Tạo chữ ký bằng Private Key CỦA SERVER
    public String signResponseWithServerKey(String payload) {
        try {
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(serverPrivateKey);
            signature.update(payload.getBytes(StandardCharsets.UTF_8));
            byte[] signedBytes = signature.sign();

            return Base64.getEncoder().encodeToString(signedBytes);
        } catch (Exception e) {
            log.error("Signing error: ", e);
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Cannot sign response");
        }
    }

    public String calculateSha256(MultipartFile file) {
        try (InputStream is = file.getInputStream()) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");

            // Đọc từng chunk 8KB một thay vì load toàn bộ file vào RAM
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = is.read(buffer)) != -1) {
                digest.update(buffer, 0, bytesRead);
            }

            byte[] hashBytes = digest.digest();

            // Chuyển mảng byte thành chuỗi Hexadecimal (Hệ cơ số 16)
            StringBuilder hexString = new StringBuilder();
            for (byte b : hashBytes) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }

            return hexString.toString();
        } catch (Exception e) {
            log.error("Lỗi khi đọc hoặc băm file firmware", e);
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Không thể xử lý file firmware.");
        }
    }
}
