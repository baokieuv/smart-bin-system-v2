package com.smart_bin.device_service.service;

import com.nimbusds.jose.shaded.gson.JsonObject;
import com.nimbusds.jose.shaded.gson.JsonParser;
import org.apache.commons.codec.digest.DigestUtils;
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

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
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

    @Value("${app.secret-key:SECRET_KEY_12345}")
    private String masterSecret;

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

    // 2. Xác thực thiết bị: Dùng Khóa bí mật (Device Secret) để verify HMAC signature thiết bị gửi lên
    public void verifySignatureWithDeviceKey(String payload, String signature, String deviceSecret) {
        try {
            String algorithm = "HmacSHA256";
            Mac mac = Mac.getInstance(algorithm);
            SecretKeySpec secretKeySpec = new SecretKeySpec(deviceSecret.getBytes(StandardCharsets.UTF_8), algorithm);
            mac.init(secretKeySpec);

            byte[] serverCalculatedHmac = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));

            byte[] deviceSignature = Base64.getDecoder().decode(signature);

            if (!MessageDigest.isEqual(serverCalculatedHmac, deviceSignature)) {
                throw new ApiException(CoreErrorCode.VALIDATION_SIGNATURE_ERROR, "Invalid HMAC signature from device");
            }
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.error("HMAC Verification error: ", e);
            throw new ApiException(CoreErrorCode.VALIDATION_SIGNATURE_ERROR, "HMAC verification failed");
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
            return DigestUtils.sha256Hex(is);
        } catch (Exception e) {
            log.error("Lỗi khi đọc hoặc băm file firmware", e);
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Không thể xử lý file firmware.");
        }
    }

    // Hàm tạo Device Secret từ MAC Address
    public String generateDeviceSecret(String macAddress, String extraInfo) {
        try {
            String dataToSign = macAddress + extraInfo;
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKeySpec = new SecretKeySpec(masterSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKeySpec);
            byte[] hmacBytes = mac.doFinal(dataToSign.getBytes(StandardCharsets.UTF_8));

            return Base64.getEncoder().encodeToString(hmacBytes);
        } catch (Exception e) {
            log.error("Error generating device secret", e);
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Cannot generate device secret");
        }
    }
}
