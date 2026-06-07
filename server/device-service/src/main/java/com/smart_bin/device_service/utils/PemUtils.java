package com.smart_bin.device_service.utils;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
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

    // Lấy Public Key của thiết bị (từ String gửi lên hoặc Database)
    public static PublicKey getPublicKeyFromString(String keyString) throws Exception {
        String publicKeyPEM = keyString
                .replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", "");

        byte[] encoded = Base64.getDecoder().decode(publicKeyPEM);
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        return keyFactory.generatePublic(new X509EncodedKeySpec(encoded));
    }

    // Lấy Private Key của Server từ file vật lý
    public static PrivateKey getPrivateKey(String filepath) throws Exception {
        String keyString = new String(Files.readAllBytes(Paths.get(filepath)));
        String privateKeyPEM = keyString
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");

        byte[] encoded = Base64.getDecoder().decode(privateKeyPEM);
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        return keyFactory.generatePrivate(new PKCS8EncodedKeySpec(encoded));
    }

    public static PrivateKey getPrivateKeyFromString(String keyContent) throws Exception {
        // 1. Loại bỏ các header/footer của chuẩn PEM và các ký tự xuống dòng
        String privateKeyPEM = keyContent
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replace("-----BEGIN RSA PRIVATE KEY-----", "")
                .replace("-----END RSA PRIVATE KEY-----", "")
                .replaceAll("\\s", ""); // Xóa khoảng trắng, \n, \r

        // 2. Decode Base64
        byte[] encoded = Base64.getDecoder().decode(privateKeyPEM);

        // 3. Tạo PrivateKey object
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(encoded);
        return keyFactory.generatePrivate(keySpec);
    }
}
