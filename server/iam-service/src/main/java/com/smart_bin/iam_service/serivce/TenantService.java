package com.smart_bin.iam_service.serivce;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smart_bin.core.common.Constants;
import com.smart_bin.core.common.EmailType;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.iam_service.common.UserState;
import com.smart_bin.iam_service.dto.auth.request.CreateTenantRequest;
import com.smart_bin.iam_service.dto.auth.request.UpdateTenantStatusRequest;
import com.smart_bin.iam_service.dto.auth.response.TenantDto;
import com.smart_bin.iam_service.dto.user.request.TenantUserMapRequest;
import com.smart_bin.iam_service.dto.user.response.UserDto;
import com.smart_bin.iam_service.entity.Tenant;
import com.smart_bin.iam_service.entity.TenantUserControl;
import com.smart_bin.iam_service.entity.User;
import com.smart_bin.iam_service.mapper.TenantMapper;
import com.smart_bin.iam_service.mapper.UserMapper;
import com.smart_bin.iam_service.repository.TenantRepository;
import com.smart_bin.iam_service.repository.TenantUserControlRepository;
import com.smart_bin.iam_service.repository.UserRepository;
import jakarta.validation.constraints.Email;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class TenantService {

    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final TenantUserControlRepository tenantUserControlRepository;
    private final KeycloakService keycloakService;
    private final TenantMapper tenantMapper;
    private final UserMapper userMapper;
    private final KafkaService kafkaService;
    private final ObjectMapper objectMapper;

    private static final SecureRandom random = new SecureRandom();

    @Value("${app.internal.secret:SUPER_SECRET_INTERNAL_KEY}")
    private String appInternalSecret;

    @Transactional
    public TenantDto createTenant(CreateTenantRequest request) {
        if (tenantRepository.findByEmail(request.email()).isPresent()) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Email Tenant đã tồn tại!");
        }

        String password = generateRandomPassword();
        String keycloakId = keycloakService.createTenantAdminAccount(
                request.email(),
                password,
                request.name()
        );

        Tenant tenant = tenantMapper.toEntity(request);
        tenant.setKeycloakId(keycloakId);
        tenant.setState(UserState.ACTIVE);

        String secretKey = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        tenant.setProvisionSecret(secretKey);

        Tenant savedTenant = tenantRepository.save(tenant);

        sendEmailToTenant(savedTenant, password, EmailType.WELCOME_TENANT);

        return tenantMapper.toDto(savedTenant);
    }

    public Page<TenantDto> getListTenants(Long page, Long size) {
        int pageIndex = (page != null && page > 0) ? page.intValue() - 1 : 0;
        int pageSize = (size != null && size > 0) ? size.intValue() : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        return tenantRepository.findAll(pageable).map(tenantMapper::toDto);
    }

    @Transactional
    public TenantDto updateTenantStatus(String tenantId, String actorId, UpdateTenantStatusRequest request) {
        Tenant tenant = tenantRepository.findById(UUID.fromString(tenantId))
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Không tìm thấy Tenant"));

        if (tenant.getKeycloakId().equals(actorId)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Bạn không thể thay đổi trạng thái của chính mình");
        }

        UserState newState = UserState.fromString(request.status());

        if (newState == UserState.ACTIVE && !tenant.isActive()) {
            tenant.setActive(true);
            keycloakService.enableUser(tenant.getKeycloakId());
        } else if (newState == UserState.DELETED && tenant.isActive()) {
            tenant.setActive(false);
            keycloakService.disableUser(tenant.getKeycloakId());
        } else if (newState == UserState.BLOCKED) {
            keycloakService.disableUser(tenant.getKeycloakId());
        } else if (newState == UserState.ACTIVE) {
            keycloakService.enableUser(tenant.getKeycloakId());
        }

        tenant.setState(newState);
        return tenantMapper.toDto(tenantRepository.save(tenant));
    }

    public Page<UserDto> getTenantUsers(String tenantKeycloakId, boolean isSuperAdmin, Long page, Long size) {
        Tenant tenant = tenantRepository.findByKeycloakId(tenantKeycloakId)
                .orElseThrow(() -> new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Tài khoản không phải Tenant hợp lệ"));

        int pageIndex = (page != null && page > 0) ? page.intValue() - 1 : 0;
        int pageSize = (size != null && size > 0) ? size.intValue() : 10;
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        Page<UserDto> userPage;

        if (isSuperAdmin){
            userPage = userRepository.findAll(pageable).map(userMapper::toDto);
        } else {
            userPage = tenantUserControlRepository.findUsersByTenantId(tenant.getId(), pageable)
                    .map(userMapper::toDto);
        }

        return userPage;
    }

    @Transactional
    public String updateTenantUserStatus(String tenantKeycloakId, String targetUserId, String newStatus) {
        Tenant tenant = tenantRepository.findByKeycloakId(tenantKeycloakId)
                .orElseThrow(() -> new ApiException(CoreErrorCode.FORBIDDEN_ACCESS));

        TenantUserControl controlRecord = tenantUserControlRepository
                .findByTenantIdAndUserId(tenant.getId(), UUID.fromString(targetUserId))
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "User này không thuộc quyền quản lý của bạn"));

        controlRecord.setState(UserState.valueOf(newStatus)); // Update State
        tenantUserControlRepository.save(controlRecord);

        return "Cập nhật trạng thái User nội bộ Tenant thành công";
    }

    public String verifyTenantSecret(String internalSecret, String secret) {
        if (!appInternalSecret.equals(internalSecret)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Internal secret không hợp lệ");
        }

        Tenant tenant = tenantRepository.findByProvisionSecret(secret)
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Secret không hợp lệ"));

        return tenant.getKeycloakId();
    }

    public String mappingTenantAndUser(String tenantId, String userId, String internalSecret) {
        if (!appInternalSecret.equals(internalSecret)) {
            throw new ApiException(CoreErrorCode.FORBIDDEN_ACCESS, "Internal secret không hợp lệ");
        }

        Tenant tenant = tenantRepository.findByKeycloakId(tenantId)
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "Tenant không tồn tại"));

        User user = userRepository.findById(UUID.fromString(userId))
                .orElseThrow(() -> new ApiException(CoreErrorCode.BAD_REQUEST, "User không tồn tại"));

        if (tenantUserControlRepository.existsByTenantIdAndUserId(tenant.getId(), user.getId())) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "User đã được gán cho Tenant này");
        }

        TenantUserControl controlRecord = new TenantUserControl();
        controlRecord.setTenantId(tenant.getId());
        controlRecord.setUserId(user.getId());
        controlRecord.setState(UserState.ACTIVE);
        tenantUserControlRepository.save(controlRecord);

        return "Mapping User vào Tenant thành công";
    }

    private void sendEmailToTenant(Tenant tenant, String initialPassword, EmailType emailType) {
        ObjectNode emailData = objectMapper.createObjectNode();
        emailData.put("email", tenant.getEmail());
        emailData.put("fullName", tenant.getName());
        emailData.put("password", initialPassword);

        kafkaService.sendEmailToUser(emailData, emailType);
    }

    private String generateRandomPassword() {
        String upperCases = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        String lowerCases = "abcdefghijkmnpqrstuvwxyz";
        String numbers = "23456789";
        String specials = "!@#$%";
        StringBuilder password = new StringBuilder(Constants.PASSWORD_LENGTH);
        password.append(upperCases.charAt(random.nextInt(upperCases.length())));
        password.append(lowerCases.charAt(random.nextInt(lowerCases.length())));
        password.append(numbers.charAt(random.nextInt(numbers.length())));
        password.append(specials.charAt(random.nextInt(specials.length())));
        for (int i = 4; i < Constants.PASSWORD_LENGTH; i++) {
            password.append(Constants.CHARACTERS.charAt(random.nextInt(Constants.CHARACTERS.length())));
        }
        return password.toString();
    }
}
