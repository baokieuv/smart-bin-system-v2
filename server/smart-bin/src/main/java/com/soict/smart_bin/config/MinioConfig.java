package com.soict.smart_bin.config;

import io.minio.MinioClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioConfig {
    private static final Logger logger = LoggerFactory.getLogger(MinioConfig.class);

    @Value("${minio.url}")
    private String minioUrl;

    @Value("${minio.access_key}")
    private String accessKey;

    @Value("${minio.secret_key}")
    private String secretKey;

    @Bean
    public MinioClient minioClient() {
        logger.info("Initializing MinIO client with endpoint: {}", minioUrl);

        MinioClient client = MinioClient.builder()
                .endpoint(minioUrl)
                .credentials(accessKey, secretKey)
                .build();

        logger.info("MinIO client initialized successfully");
        return client;
    }
}