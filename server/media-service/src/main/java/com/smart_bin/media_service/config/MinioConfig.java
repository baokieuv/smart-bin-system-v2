package com.smart_bin.media_service.config;

import io.minio.MinioClient;
import org.apache.tika.Tika;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioConfig {

    @Value("${minio.url}")
    private String minioUrl;

    @Value("${minio.access_key}")
    private String accessKey;

    @Value("${minio.secret_key}")
    private String secretKey;

    @Bean
    public Tika tika() {
        return new Tika();
    }

    @Bean
    public MinioClient minioClient() {
        return MinioClient.builder()
                .endpoint(minioUrl)
                .credentials(accessKey, secretKey)
                .build();
    }
}
