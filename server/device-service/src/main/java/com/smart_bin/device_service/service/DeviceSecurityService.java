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

import java.nio.charset.StandardCharsets;
import java.security.PublicKey;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;

@Service
@Slf4j
public class DeviceSecurityService {
    private PublicKey serverPublicKey;

    @Value("classpath:public_key.pem")
    private Resource publicKeyResource;

    @PostConstruct
    public void init() {
        try {
            String path = publicKeyResource.getFile().getAbsolutePath();
            this.serverPublicKey = PemUtils.readPublicKey(path);
        } catch (Exception e) {
            log.error("Failed to load RSA Public Key");
        }
    }

    public String verifyAndExtractMac(String payload, String signature) {
        try {
            byte[] digitalSignature = Base64.getDecoder().decode(signature);
            Signature verify = Signature.getInstance("SHA256withRSA");
            verify.initVerify(serverPublicKey);
            verify.update(payload.getBytes(StandardCharsets.UTF_8));

            if (!verify.verify(digitalSignature)) {
                throw new ApiException(CoreErrorCode.VALIDATION_SIGNATURE_ERROR);
            }

            JsonObject obj = JsonParser.parseString(payload).getAsJsonObject();
            String mac = obj.get("mac").getAsString();
            long timestamp = obj.get("timestamp").getAsLong();
            long now = Instant.now().toEpochMilli();

            if (now - timestamp > Constants.TIMESTAMP_EXPIRY) {
                throw new ApiException(CoreErrorCode.VALIDATION_SIGNATURE_ERROR);
            }

            return mac;
        }
        catch (ApiException ex){
            throw ex;
        }
        catch (Exception e) {
            log.error("Verification error: ", e);
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Signature verification failed");
        }
    }
}
