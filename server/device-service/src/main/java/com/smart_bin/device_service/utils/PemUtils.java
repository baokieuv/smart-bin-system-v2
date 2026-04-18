package com.smart_bin.device_service.utils;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

public class PemUtils {

    public static PublicKey readPublicKey(String filepath) throws Exception {
        // 1. Read the file content as a String
        String keyString = new String(Files.readAllBytes(Paths.get(filepath)));

        // 2. Strip the headers, footers, and any newline characters
        String publicKeyPEM = keyString
                .replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", ""); // Removes all whitespace and newlines

        // 3. Base64 decode the string into raw bytes
        byte[] encoded = Base64.getDecoder().decode(publicKeyPEM);

        // 4. Generate the PublicKey object using X.509 standard (required for Public Keys)
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        X509EncodedKeySpec keySpec = new X509EncodedKeySpec(encoded);

        return keyFactory.generatePublic(keySpec);
    }
}
