package com.smart_bin.media_service.service;

import com.smart_bin.core.common.Constants;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.media_service.dto.response.MediaFileDto;
import com.smart_bin.media_service.dto.response.PresignedUrlResponse;
import com.smart_bin.media_service.dto.response.UploadFileResponse;
import io.minio.*;
import io.minio.http.Method;
import io.minio.messages.Item;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
@Slf4j
public class MediaStorageService {

    private static final String USER_ROOT = "users";

    private final MinioClient minioClient;
    private final Tika tika;

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

    @PostConstruct
    public void init() {
        try {
            boolean bucketExists = minioClient.bucketExists(
                    BucketExistsArgs.builder().bucket(bucketName).build()
            );
            if (!bucketExists) {
                minioClient.makeBucket(
                        MakeBucketArgs.builder().bucket(bucketName).build()
                );
                log.info("Created MinIO bucket: {}", bucketName);
            } else {
                log.info("ℹ MinIO bucket already exists: {}", bucketName);
            }
        } catch (Exception e) {
            log.error("Failed to initialize MinIO bucket: {}", e.getMessage());
        }
    }

    public UploadFileResponse uploadFile(String keycloakId, MultipartFile file, String folder, String oldObjectName) {
        validateFile(file, false);

        // Sinh ra tên file hợp lý dựa trên logic
        String finalObjectName = determineFinalObjectName(keycloakId, folder, oldObjectName, file.getContentType());

        try {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(finalObjectName)
                            .stream(file.getInputStream(), file.getSize(), -1)
                            .contentType(file.getContentType())
                            .build()
            );

            String objectUrl = String.format("%s/%s/%s", minioUrl, bucketName, finalObjectName);
            return new UploadFileResponse(finalObjectName, objectUrl, file.getContentType(), file.getSize());
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ApiException(CoreErrorCode.EXTERNAL_API_ERROR, "Upload to MinIO failed");
        }
    }

    public PresignedUrlResponse createPresignedUploadUrl(String keycloakId, String folder, String oldObjectName, String contentType) {
        if (!StringUtils.hasText(contentType)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "contentType is required");
        }

        if (!allowedMimeTypes().contains(contentType.trim().toLowerCase(Locale.ROOT))) {
            throw new ApiException(CoreErrorCode.FILE_IS_NOT_VALID);
        }

        // Sinh ra tên file hợp lý dựa trên logic
        String finalObjectName = determineFinalObjectName(keycloakId, folder, oldObjectName, contentType);

        try {
            String url = minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.PUT)
                            .bucket(bucketName)
                            .object(finalObjectName)
                            .expiry(uploadUrlExpiryMinutes, TimeUnit.MINUTES)
                            .build()
            );
            return new PresignedUrlResponse(finalObjectName, url, uploadUrlExpiryMinutes * 60);
        } catch (Exception ex) {
            throw new ApiException(CoreErrorCode.EXTERNAL_API_ERROR, "Generate presigned upload URL failed");
        }
    }

    public PresignedUrlResponse createPresignedDownloadUrl(String keycloakId, String objectName) {
        String fullObjectName = resolveUserObjectName(keycloakId, objectName);

        if (!isObjectExist(fullObjectName)) {
            throw new ApiException(CoreErrorCode.RESOURCE_NOT_FOUND);
        }

        try {
            String url = minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(bucketName)
                            .object(fullObjectName)
                            .expiry(downloadUrlExpiryMinutes, TimeUnit.MINUTES)
                            .build()
            );
            return new PresignedUrlResponse(fullObjectName, url, downloadUrlExpiryMinutes * 60);
        } catch (Exception ex) {
            throw new ApiException(CoreErrorCode.EXTERNAL_API_ERROR, "Generate presigned download URL failed");
        }
    }

    public List<MediaFileDto> listFiles(String keycloakId, String relativePrefix) {
        String userPrefix = userPrefix(keycloakId);
        String normalizedPrefix = normalizePrefix(relativePrefix);
        String lookupPrefix = normalizedPrefix.isBlank() ? userPrefix : userPrefix + normalizedPrefix;

        try {
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

    public PresignedUrlResponse createInternalPresignedUploadUrl(String macAddress, String fileName, String contentType) {
        if (!StringUtils.hasText(fileName) || !StringUtils.hasText(macAddress) || !StringUtils.hasText(contentType)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "fileName, macAddress and contentType are required");
        }
        if (!allowedMimeTypes().contains(contentType.trim().toLowerCase(Locale.ROOT))) {
            throw new ApiException(CoreErrorCode.FILE_IS_NOT_VALID);
        }
        String safeMac = macAddress.replace(":", "").replace("-", "");
        String objectName = "devices/" + safeMac + "/" + Constants.generateFileName(contentType, "");

        try {
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

    public UploadFileResponse uploadFileInternal(
            MultipartFile file, String extra, String folder
    ){
        validateFile(file, true);

        // Sinh ra tên file hợp lý dựa trên logic
        String finalObjectName = generateFinalObjectName(folder, file.getContentType(), extra);

        try {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(finalObjectName)
                            .stream(file.getInputStream(), file.getSize(), -1)
                            .contentType(file.getContentType())
                            .build()
            );

            String objectUrl = String.format("%s/%s/%s", minioUrl, bucketName, finalObjectName);
            return new UploadFileResponse(finalObjectName, objectUrl, file.getContentType(), file.getSize());
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ApiException(CoreErrorCode.EXTERNAL_API_ERROR, "Upload to MinIO failed");
        }
    }

    private void validateFile(MultipartFile file, boolean isInternal) {
        try {
            if (file == null || file.isEmpty()) throw new ApiException(CoreErrorCode.FILE_IS_NOT_VALID);
            if (file.getSize() > maxFileSizeBytes) throw new ApiException(CoreErrorCode.FILE_TOO_LARGE);
            String originalFileName = sanitizeFileName(file.getOriginalFilename());
            if (!StringUtils.hasText(originalFileName)) throw new ApiException(CoreErrorCode.FILE_IS_NOT_VALID);
            try (InputStream inputStream = file.getInputStream()) {
                String detectedMimeType = tika.detect(inputStream);

                Set<String> allowed = allowedMimeTypes();

                if (isInternal) {
                    allowed.add("application/octet-stream");
                    allowed.add("application/macbinary");
                }

                if (!allowed.contains(detectedMimeType)) {
                    throw new ApiException(CoreErrorCode.FILE_IS_NOT_VALID, "Định dạng file không được hỗ trợ: " + detectedMimeType);
                }
            }
        }
        catch (ApiException ex) { throw ex; }
        catch (Exception ex) { throw new ApiException(CoreErrorCode.FILE_IS_NOT_VALID); }
    }

    // ==========================================
    // HÀM XỬ LÝ LOGIC CHÍNH: TẠO MỚI HOẶC GHI ĐÈ
    // ==========================================
    private String determineFinalObjectName(String keycloakId, String folder, String oldObjectName, String contentType) {

        // TRƯỜNG HỢP 1: Có truyền tên file cũ -> Kiểm tra tồn tại để ghi đè
        if (StringUtils.hasText(oldObjectName)) {
            String safeOldName = resolveUserObjectName(keycloakId, oldObjectName);

            if (isObjectExist(safeOldName)) {
                log.info("Object exists, generating URL to OVERWRITE: {}", safeOldName);
                return safeOldName;
            } else {
                log.warn("Old object not found, switching to CREATE NEW workflow.");
            }
        }

        // TRƯỜNG HỢP 2: Không truyền oldObjectName (hoặc file cũ bị xóa mất) -> TẠO MỚI
        String userPrefix = userPrefix(keycloakId);
        String folderPath = "";

        if (StringUtils.hasText(folder)) {
            folderPath = normalizePrefix(folder);
            // Thêm dấu "/" vào cuối folder để rẽ nhánh đúng vào thư mục, không bị dính liền tên
            if (!folderPath.isEmpty() && !folderPath.endsWith("/")) {
                folderPath += "/";
            }
        }

        // Kết quả: users/123/ + avatar/ + uuid.jpg
        String newObjectName = userPrefix + folderPath + Constants.generateFileName(contentType, "");
        log.info("Generating URL for NEW file: {}", newObjectName);
        return newObjectName;
    }

    private String generateFinalObjectName(String folder, String extra, String contentType) {
        String folderPath = "";

        if (StringUtils.hasText(folder)) {
            folderPath = normalizePrefix(folder);
            // Thêm dấu "/" vào cuối folder để rẽ nhánh đúng vào thư mục, không bị dính liền tên
            if (!folderPath.isEmpty() && !folderPath.endsWith("/")) {
                folderPath += "/";
            }
        }

        String newObjectName = folderPath + Constants.generateFileName(contentType, extra);
        log.info("Generating URL for NEW file: {}", newObjectName);
        return newObjectName;
    }

    private boolean isObjectExist(String objectName) {
        try {
            minioClient.statObject(StatObjectArgs.builder().bucket(bucketName).object(objectName).build());
            return true;
        } catch (io.minio.errors.ErrorResponseException e) {
            return false; // Trả về false nếu không tìm thấy file
        } catch (Exception e) {
            return false;
        }
    }

    private String resolveUserObjectName(String keycloakId, String objectName) {
        String normalized = normalizePrefix(objectName);
        if (!StringUtils.hasText(normalized)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "objectName is required");
        }

        // Tự động gọt bỏ phần domain hoặc bucket name bị thừa ở phía trước (nếu có)
        if (normalized.startsWith(bucketName + "/")) {
            normalized = normalized.substring(bucketName.length() + 1);
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
        if (!StringUtils.hasText(input)) return "";

        String cleaned = StringUtils.cleanPath(input).replace('\\', '/').trim();
        if (cleaned.startsWith("/")) cleaned = cleaned.substring(1);
        if (cleaned.contains("..")) throw new ApiException(CoreErrorCode.BAD_REQUEST, "Path traversal is not allowed");

        // Đã sửa để file và folder xử lý độc lập, không ép buộc thêm dấu "/" cuối cùng
        return cleaned;
    }

    private String sanitizeFileName(String fileName) {
        if (!StringUtils.hasText(fileName)) return "";
        String cleaned = StringUtils.cleanPath(Objects.requireNonNull(fileName)).replace('\\', '/');
        if (cleaned.contains("..")) throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid file name");
        int slashIndex = cleaned.lastIndexOf('/');
        if (slashIndex >= 0) cleaned = cleaned.substring(slashIndex + 1);
        return cleaned;
    }

    private Set<String> allowedMimeTypes() {
        String[] values = allowedMimeTypesConfig.split(",");
        Set<String> result = new HashSet<>();
        for (String value : values) {
            String normalized = value.trim().toLowerCase(Locale.ROOT);
            if (!normalized.isEmpty()) result.add(normalized);
        }
        return result;
    }
}