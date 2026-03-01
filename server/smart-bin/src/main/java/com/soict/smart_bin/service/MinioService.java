package com.soict.smart_bin.service;


import io.minio.ListObjectsArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.Result;
import io.minio.messages.Item;
import org.apache.tika.Tika;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.*;

@Service
public class MinioService {
    private static final Logger logger = LoggerFactory.getLogger(MinioService.class);

    private final MinioClient minioClient;

    private static final String FILE_PREFIX = "avatar/image_";
    private static final List<String> ALLOWED_MIME_TYPES = Arrays.asList(
            MediaType.IMAGE_JPEG_VALUE,
            MediaType.IMAGE_PNG_VALUE,
            MediaType.IMAGE_GIF_VALUE,
            "image/webp",
            "image/heic",
            "image/heif",
            "image/jpg"
    );
    private static final int IMAGE_TARGET_SIZE = 1024 * 1024;
    private static final List<String> ALLOWED_EXTENSIONS = Arrays.asList("jpeg", "png", "gif", "webp", "heic", "heif", "jpg");
    private final Tika tika = new Tika();

    @Value("${minio.bucket}")
    private String bucketName;

    @Value("${minio.url}")
    private String minioUrl;

    public MinioService(MinioClient minioClient){
        this.minioClient = minioClient;
    }

    public String uploadFile(MultipartFile file) throws Exception{
        validateFileUpload(file);

        String fileName = generateFileName(Objects.requireNonNull(file.getContentType()));
        minioClient.putObject(
                PutObjectArgs.builder()
                        .bucket(bucketName)
                        .object(fileName)
                        .stream(file.getInputStream(), file.getSize(), -1)
                        .contentType(file.getContentType())
                        .build()
        );

        return String.format("%s/%s/%s", minioUrl, bucketName, fileName);
    }

    public List<String> getFileList() throws Exception {
        logger.debug("Fetching file list from bucket: {}", bucketName);

        List<String> fileNames = new ArrayList<>();
        Iterable<Result<Item>> results = minioClient.listObjects(
                ListObjectsArgs.builder()
                        .bucket(bucketName)
                        .build()
        );

        for (Result<Item> result : results) {
            Item item = result.get();
            fileNames.add(item.objectName());
        }

        logger.info("Found {} files in bucket: {}", fileNames.size(), bucketName);
        return fileNames;
    }

    private void validateFileUpload(MultipartFile file) {
        try {
            if (file == null || file.isEmpty()) {
                throw new RuntimeException("File empty");
            }

            String originalFileName = StringUtils.cleanPath(Objects.requireNonNull(file.getOriginalFilename()));
            if (originalFileName.contains("..")) {
                throw new RuntimeException("File not valid");
            }

            try (InputStream inputStream = file.getInputStream()) {
                String mimeType = tika.detect(inputStream);

                if (!ALLOWED_MIME_TYPES.contains(mimeType)) {
                    throw new RuntimeException("Content is not allowed");
                }
            }
            String fileExtension = getFileExtension(originalFileName);
            if (!ALLOWED_EXTENSIONS.contains(fileExtension.toLowerCase())) {
                throw new RuntimeException("Extension is not allowed");
            }

            if (file.getSize() > IMAGE_TARGET_SIZE) {
                throw new RuntimeException("File too large");
            }
        } catch (Exception e) {
            logger.error("Error: {}", e.getMessage(), e);
        }
    }

    private String getFileExtension(String fileName){
        int dotIndex = fileName.lastIndexOf('.');
        return (dotIndex == -1) ? "" : fileName.substring(dotIndex + 1);
    }

    private String generateFileName(String contentType){
        String uniqueId = UUID.randomUUID().toString().substring(0, 12);

        return FILE_PREFIX + uniqueId + "." + contentType.substring(contentType.indexOf("/") + 1);
    }
}