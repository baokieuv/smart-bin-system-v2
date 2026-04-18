package com.smart_bin.media_service.service;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.media_service.dto.response.MediaFileDto;
import com.smart_bin.media_service.dto.response.PresignedUrlResponse;
import com.smart_bin.media_service.dto.response.UploadFileResponse;
import io.minio.*;
import io.minio.http.Method;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import org.apache.tika.Tika;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class MediaStorageService {

    private static final String USER_ROOT = "users";

    private final MinioClient minioClient;
    private final Tika tika = new Tika();

    @Value("${minio.bucket}")
    private String bucketName;

    @Value("${minio.url}")
    private String minioUrl;

    @Value("${media.max-file-size-bytes:5242880}")
    private long maxFileSizeBytes;

    @Value("${media.upload-url-expiry-minutes:15}")
    private int uploadUrlExpiryMinutes;

    @Value("${media.download-url-expiry-minutes:15}")
    private int downloadUrlExpiryMinutes;

    @Value("${media.allowed-mime-types:image/jpeg,image/png,image/webp,image/gif,application/pdf}")
    private String allowedMimeTypesConfig;

    public UploadFileResponse uploadFile(String keycloakId, MultipartFile file, String folder) {
        validateFile(file);

        String objectName = buildObjectName(keycloakId, folder, file.getOriginalFilename());

        try {
            ensureBucketExists();
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectName)
                            .stream(file.getInputStream(), file.getSize(), -1)
                            .contentType(file.getContentType())
                            .build()
            );

            String objectUrl = String.format("%s/%s/%s", minioUrl, bucketName, objectName);
            return new UploadFileResponse(objectName, objectUrl, file.getContentType(), file.getSize());
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ApiException(CoreErrorCode.EXTERNAL_API_ERROR, "Upload to MinIO failed");
        }
    }

    public PresignedUrlResponse createPresignedUploadUrl(String keycloakId, String fileName, String folder) {
        if (!StringUtils.hasText(fileName)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "fileName is required");
        }

        String objectName = buildObjectName(keycloakId, folder, fileName);

        try {
            ensureBucketExists();
            String url = minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.PUT)
                            .bucket(bucketName)
                            .object(objectName)
                            .expiry(uploadUrlExpiryMinutes, TimeUnit.MINUTES)
                            .build()
            );
            return new PresignedUrlResponse(objectName, url, uploadUrlExpiryMinutes * 60);
        } catch (Exception ex) {
            throw new ApiException(CoreErrorCode.EXTERNAL_API_ERROR, "Generate presigned upload URL failed");
        }
    }

    public PresignedUrlResponse createPresignedDownloadUrl(String keycloakId, String objectName) {
        String fullObjectName = resolveUserObjectName(keycloakId, objectName);

        try {
            ensureBucketExists();
            minioClient.statObject(
                    StatObjectArgs.builder()
                            .bucket(bucketName)
                            .object(fullObjectName)
                            .build()
            );
            String url = minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(bucketName)
                            .object(fullObjectName)
                            .expiry(downloadUrlExpiryMinutes, TimeUnit.MINUTES)
                            .build()
            );
            return new PresignedUrlResponse(fullObjectName, url, downloadUrlExpiryMinutes * 60);
        } catch (io.minio.errors.ErrorResponseException ex) {
            throw new ApiException(CoreErrorCode.RESOURCE_NOT_FOUND);
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ApiException(CoreErrorCode.EXTERNAL_API_ERROR, "Generate presigned download URL failed");
        }
    }

    public List<MediaFileDto> listFiles(String keycloakId, String relativePrefix) {
        String userPrefix = userPrefix(keycloakId);
        String normalizedPrefix = normalizePrefix(relativePrefix);
        String lookupPrefix = normalizedPrefix.isBlank() ? userPrefix : userPrefix + normalizedPrefix;

        try {
            ensureBucketExists();

            Iterable<Result<Item>> items = minioClient.listObjects(
                    ListObjectsArgs.builder()
                            .bucket(bucketName)
                            .prefix(lookupPrefix)
                            .recursive(true)
                            .build()
            );

            List<MediaFileDto> responses = new ArrayList<>();
            for (Result<Item> result : items) {
                Item item = result.get();
                responses.add(new MediaFileDto(item.objectName(), item.size(), item.lastModified().toOffsetDateTime()));
            }
            return responses;
        } catch (Exception ex) {
            throw new ApiException(CoreErrorCode.EXTERNAL_API_ERROR, "Cannot list files from MinIO");
        }
    }

    public void deleteFile(String keycloakId, String objectName) {
        String fullObjectName = resolveUserObjectName(keycloakId, objectName);
        try {
            ensureBucketExists();
            minioClient.removeObject(
                    RemoveObjectArgs.builder()
                            .bucket(bucketName)
                            .object(fullObjectName)
                            .build()
            );
        } catch (Exception ex) {
            throw new ApiException(CoreErrorCode.EXTERNAL_API_ERROR, "Delete file from MinIO failed");
        }
    }

    public PresignedUrlResponse createInternalPresignedUploadUrl(String macAddress, String fileName) {
        if (!StringUtils.hasText(fileName) || !StringUtils.hasText(macAddress)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "fileName and macAddress are required");
        }

        // Tạo objectName chuẩn: devices/{macAddress}/{uuid}_filename.jpg
        String safeMac = macAddress.replace(":", "").replace("-", "");
        String objectName = "devices/" + safeMac + "/" + UUID.randomUUID() + "_" + sanitizeFileName(fileName);

        try {
            ensureBucketExists();
            String url = minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.PUT)
                            .bucket(bucketName)
                            .object(objectName)
                            .expiry(uploadUrlExpiryMinutes, TimeUnit.MINUTES)
                            .build()
            );
            return new PresignedUrlResponse(objectName, url, uploadUrlExpiryMinutes * 60);
        } catch (Exception ex) {
            throw new ApiException(CoreErrorCode.EXTERNAL_API_ERROR, "Generate internal presigned URL failed");
        }
    }

    private void ensureBucketExists() throws Exception {
        boolean bucketExists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build());
        if (!bucketExists) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
        }
    }

    private void validateFile(MultipartFile file) {
        try {
            if (file == null || file.isEmpty()) {
                throw new ApiException(CoreErrorCode.FILE_IS_NOT_VALID);
            }

            if (file.getSize() > maxFileSizeBytes) {
                throw new ApiException(CoreErrorCode.FILE_TOO_LARGE);
            }

            String originalFileName = sanitizeFileName(file.getOriginalFilename());
            if (!StringUtils.hasText(originalFileName)) {
                throw new ApiException(CoreErrorCode.FILE_IS_NOT_VALID);
            }

            try (InputStream inputStream = file.getInputStream()) {
                String detectedMimeType = tika.detect(inputStream);
                if (!allowedMimeTypes().contains(detectedMimeType.toLowerCase(Locale.ROOT))) {
                    throw new ApiException(CoreErrorCode.FILE_IS_NOT_VALID);
                }
            }
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ApiException(CoreErrorCode.FILE_IS_NOT_VALID);
        }
    }

    private String buildObjectName(String keycloakId, String folder, String originalFilename) {
        String userPrefix = userPrefix(keycloakId);
        String normalizedFolder = normalizePrefix(folder);
        String safeFileName = sanitizeFileName(originalFilename);

        if (!StringUtils.hasText(safeFileName)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid file name");
        }

        String uniqueName = UUID.randomUUID() + "_" + safeFileName;
        if (!normalizedFolder.isBlank()) {
            return userPrefix + normalizedFolder + uniqueName;
        }
        return userPrefix + uniqueName;
    }

    private String resolveUserObjectName(String keycloakId, String objectName) {
        String normalized = normalizePrefix(objectName);
        if (!StringUtils.hasText(normalized)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "objectName is required");
        }

        String userPrefix = userPrefix(keycloakId);
        if (normalized.startsWith(userPrefix)) {
            return normalized;
        }
        return userPrefix + normalized;
    }

    private String userPrefix(String keycloakId) {
        if (!StringUtils.hasText(keycloakId)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS);
        }
        return USER_ROOT + "/" + keycloakId + "/";
    }

    private String normalizePrefix(String input) {
        if (!StringUtils.hasText(input)) {
            return "";
        }

        String cleaned = StringUtils.cleanPath(input).replace('\\', '/').trim();
        if (cleaned.startsWith("/")) {
            cleaned = cleaned.substring(1);
        }
        if (cleaned.contains("..")) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Path traversal is not allowed");
        }
        if (!cleaned.isEmpty() && !cleaned.endsWith("/")) {
            cleaned = cleaned + "/";
        }
        return cleaned;
    }

    private String sanitizeFileName(String fileName) {
        if (!StringUtils.hasText(fileName)) {
            return "";
        }
        String cleaned = StringUtils.cleanPath(Objects.requireNonNull(fileName)).replace('\\', '/');
        if (cleaned.contains("..")) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid file name");
        }
        int slashIndex = cleaned.lastIndexOf('/');
        if (slashIndex >= 0) {
            cleaned = cleaned.substring(slashIndex + 1);
        }
        return cleaned;
    }

    private Set<String> allowedMimeTypes() {
        String[] values = allowedMimeTypesConfig.split(",");
        Set<String> result = new HashSet<>();
        for (String value : values) {
            String normalized = value.trim().toLowerCase(Locale.ROOT);
            if (!normalized.isEmpty()) {
                result.add(normalized);
            }
        }
        return result;
    }
}
