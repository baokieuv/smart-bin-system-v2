package com.soict.smart_bin.service;

import com.soict.smart_bin.common.Constants;
import com.soict.smart_bin.common.TokenType;
import com.soict.smart_bin.common.UserState;
import com.soict.smart_bin.dto.auth.ResendVerificationRequest;
import com.soict.smart_bin.dto.user.CreateUserRequest;
import com.soict.smart_bin.dto.user.UserDto;
import com.soict.smart_bin.entity.User;
import com.soict.smart_bin.exception.ApiException;
import com.soict.smart_bin.exception.CoreErrorCode;
import com.soict.smart_bin.mapper.UserMapper;
import com.soict.smart_bin.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {
    private final UserRepository userRepository;
    private final KeycloakService keycloakService;
    private final UserMapper mapper;
    private final EmailService emailService;
    private final MinioService minioService;

    private static final String FILE_PREFIX = "avatar/image_";

    @Value("${minio.url}")
    private String minioUrl;

    @Transactional
    public UserDto createUser(CreateUserRequest request) {
        // 1. Tìm user hoặc khởi tạo mới
        User user = userRepository.findByEmail(request.email()).orElse(null);

        if (user != null) {
            // Nếu user đã tồn tại và đang active -> Báo lỗi
            if (user.isActive()) {
                throw new ApiException(CoreErrorCode.USER_ALREADY_EXISTED);
            }
            // Nếu user tồn tại nhưng inactive -> Kích hoạt lại
            user.setActive(true);
        } else {
            // Nếu là user hoàn toàn mới -> Tạo trên Keycloak và khởi tạo object User
            String keycloakUserId = keycloakService.createUser(request);

            user = new User();
            user.setKeycloakId(keycloakUserId);
            user.setEmail(request.email());
            user.setFirstName(request.firstName());
            user.setLastName(request.lastName());
        }

        // 2. Cấu hình các thông số dùng chung cho cả 2 trường hợp
        user.setEmailVerified(false);
        user.setState(UserState.PENDING); // Chờ xác thực email
        user.setActionToken(UUID.randomUUID().toString());
        user.setActionTokenExpiry(System.currentTimeMillis() + Constants.VERIFICATION_TOKEN_EXPIRY);
        user.setTokenType(TokenType.VERIFY_EMAIL);

        // 3. Lưu vào Database
        User savedUser = userRepository.save(user);

        // 4. Gửi email xác nhận
        emailService.sendVerificationEmail(
                savedUser.getEmail(),
                savedUser.getFirstName(),
                savedUser.getActionToken()
        );

        // 5. Trả về DTO
        return mapper.toDto(savedUser);
    }

    @Transactional
    public String verifyEmail(String token) {
        User user = userRepository.findByActionTokenAndActiveTrue(token)
                .orElseThrow(() -> new ApiException(CoreErrorCode.INVALID_TOKEN));

        if (user.isEmailVerified()) {
            throw new RuntimeException("Email already verified");
        }

        if (System.currentTimeMillis() > user.getActionTokenExpiry()) {
            throw new ApiException(CoreErrorCode.INVALID_TOKEN);
        }

        user.setEmailVerified(true);
        user.setActionToken(null);
        user.setActionTokenExpiry(null);
        user.setState(UserState.ACTIVE);

        userRepository.save(user);
        keycloakService.enableUser(user.getKeycloakId());
        emailService.sendWelcomeEmail(user.getEmail(), user.getFirstName());

        return "Email verified successfully";
    }

    public UserDto getUserById(String userId) {
        UUID uuid = UUID.fromString(userId);

        User user = userRepository.findByIdAndActiveTrue(uuid)
                .orElseThrow(() -> new ApiException(CoreErrorCode.USER_NOT_FOUND));

        return mapper.toDto(user);
    }

    public UserDto getUserByKeycloakId(String keycloakId){
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(CoreErrorCode.USER_NOT_FOUND));

        return mapper.toDto(user);
    }

    public void deleteUserById(String userId) {
        UUID uuid = UUID.fromString(userId);

        User user = userRepository.findByIdAndActiveTrue(uuid)
                .orElseThrow(() -> new ApiException(CoreErrorCode.USER_NOT_FOUND));

        user.setActive(false);
        user.setState(UserState.DELETED);

        userRepository.save(user);
    }

    public void resendVerificationEmail(ResendVerificationRequest request) {
        User user = userRepository.findByEmailAndActiveTrue(request.email())
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (user.isEmailVerified()) {
            throw new RuntimeException("Email already verified");
        }

        user.setActionToken(UUID.randomUUID().toString());
        user.setTokenType(TokenType.VERIFY_EMAIL);
        user.setActionTokenExpiry(System.currentTimeMillis() + Constants.VERIFICATION_TOKEN_EXPIRY);

        userRepository.save(user);

        emailService.sendVerificationEmail(
                user.getEmail(),
                user.getFirstName(),
                user.getActionToken()
        );
    }

    public String validateAndUploadImage(MultipartFile file, String keycloakId) {

        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(CoreErrorCode.USER_NOT_FOUND));

        try {
            String avatarUrl = user.getAvatarUrl();
            String filename;

            if (avatarUrl != null && avatarUrl.startsWith(minioUrl)) {
                filename = avatarUrl.substring(avatarUrl.lastIndexOf("/") + 1);
            }
            else {
                filename = generateFileName(Objects.requireNonNull(file.getContentType()));
            }

            String imageUrl = minioService.uploadFile(file, filename);
            user.setAvatarUrl(imageUrl);
            userRepository.save(user);

            return imageUrl;
        }catch (Exception e){
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, e.getMessage());
        }
    }

    private String generateFileName(String contentType){
        String uniqueId = UUID.randomUUID().toString().substring(0, 12);

        return FILE_PREFIX + uniqueId + "." + contentType.substring(contentType.indexOf("/") + 1);
    }
}
