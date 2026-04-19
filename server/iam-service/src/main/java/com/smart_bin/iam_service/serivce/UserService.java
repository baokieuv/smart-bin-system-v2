package com.smart_bin.iam_service.serivce;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smart_bin.core.common.Constants;
import com.smart_bin.core.common.EmailType;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.iam_service.common.TokenType;
import com.smart_bin.iam_service.common.UserState;
import com.smart_bin.iam_service.dto.auth.request.ResendVerificationRequest;
import com.smart_bin.iam_service.dto.user.request.CreateUserRequest;
import com.smart_bin.iam_service.dto.user.request.UpdateUserRequest;
import com.smart_bin.iam_service.dto.user.response.UserDto;
import com.smart_bin.iam_service.entity.User;
import com.smart_bin.iam_service.exception.AuthErrorCode;
import com.smart_bin.iam_service.exception.UserErrorCode;
import com.smart_bin.iam_service.mapper.UserMapper;
import com.smart_bin.iam_service.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {
    private final UserRepository userRepository;
    private final KeycloakService keycloakService;
    private final UserMapper mapper;
    private final KafkaService kafkaService;
    private final ObjectMapper objectMapper;

    @Transactional
    public UserDto createUser(CreateUserRequest request) {
        // 1. Tìm user hoặc khởi tạo mới
        User user = userRepository.findByEmail(request.email()).orElse(null);

        if (user != null) {
            // Nếu user đã tồn tại và đang active -> Báo lỗi
            if (user.isActive()) {
                throw new ApiException(UserErrorCode.USER_ALREADY_EXISTED);
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
        ObjectNode emailData = objectMapper.createObjectNode();
        emailData.put("email", savedUser.getEmail());
        emailData.put("fullName", savedUser.getFirstName());
        emailData.put("activationCode", savedUser.getActionToken());

        // Gọi KafkaService để gửi
        kafkaService.sendEmailToUser(emailData, EmailType.VERIFICATION);

        // 5. Trả về DTO
        return mapper.toDto(savedUser);
    }

    @Transactional
    public String verifyEmail(String token) {
        User user = userRepository.findByActionTokenAndActiveTrue(token)
                .orElseThrow(() -> new ApiException(AuthErrorCode.INVALID_TOKEN));

        if (user.isEmailVerified()) {
            throw new RuntimeException("Email already verified");
        }

        if (System.currentTimeMillis() > user.getActionTokenExpiry()) {
            throw new ApiException(AuthErrorCode.INVALID_TOKEN);
        }

        user.setEmailVerified(true);
        user.setActionToken(null);
        user.setActionTokenExpiry(null);
        user.setState(UserState.ACTIVE);

        userRepository.save(user);
        keycloakService.enableUser(user.getKeycloakId());

        // 4. Gửi email welcome
        ObjectNode emailData = objectMapper.createObjectNode();
        emailData.put("email", user.getEmail());
        emailData.put("fullName", user.getFirstName());

        // Gọi KafkaService để gửi
        kafkaService.sendEmailToUser(emailData, EmailType.WELCOME);

        return "Email verified successfully";
    }

    public UserDto getUserById(String userId) {
        UUID uuid = UUID.fromString(userId);

        User user = userRepository.findByIdAndActiveTrue(uuid)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        return mapper.toDto(user);
    }

    public UserDto getUserByKeycloakId(String keycloakId){
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        return mapper.toDto(user);
    }

    public UserDto updateUser(String keycloakId, UpdateUserRequest request) {
        User user = userRepository.findByKeycloakIdAndActiveTrue(keycloakId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

        user.setFirstName(request.firstName());
        user.setLastName(request.lastName());

        User savedUser = userRepository.save(user);

        return mapper.toDto(savedUser);
    }

    public void deleteUserById(String userId) {
        User user = userRepository.findByKeycloakIdAndActiveTrue(userId)
                .orElseThrow(() -> new ApiException(UserErrorCode.USER_NOT_FOUND));

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

        // 4. Gửi email xác nhận
        ObjectNode emailData = objectMapper.createObjectNode();
        emailData.put("email", user.getEmail());
        emailData.put("fullName", user.getFirstName());
        emailData.put("activationCode", user.getActionToken());

        // Gọi KafkaService để gửi
        kafkaService.sendEmailToUser(emailData, EmailType.VERIFICATION);
    }
}
