package com.smart_bin.iam_service.config;

import com.smart_bin.core.common.UserRole;
import com.smart_bin.iam_service.common.UserState;
import com.smart_bin.iam_service.entity.Tenant;
import com.smart_bin.iam_service.repository.TenantRepository;
import com.smart_bin.iam_service.serivce.KeycloakService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private final TenantRepository tenantRepository;
    private final KeycloakService keycloakService;

    @Value("${app.admin.root-email}")
    private String rootEmail;

    @Value("${app.admin.root-password}")
    private String rootPassword;

    @Override
    public void run(String... args) throws Exception {
        initSuperAdmin();
    }

    private void initSuperAdmin() {
        if (tenantRepository.findByEmail(rootEmail).isEmpty()) {
            log.info("Không tìm thấy Super Admin. Tiến hành khởi tạo tài khoản Root...");
            try {
                // 1. Tạo tài khoản trên Keycloak và gán Role SUPER_ADMIN
                String keycloakId = keycloakService.createSuperAdminAccount(rootEmail, rootPassword, "Super Admin");

                // 2. Lưu thông tin vào Database nội bộ (Bảng Tenant)
                Tenant rootAdmin = new Tenant();
                rootAdmin.setKeycloakId(keycloakId);
                rootAdmin.setEmail(rootEmail);
                rootAdmin.setName("Super Admin");
                rootAdmin.setState(UserState.ACTIVE);
                rootAdmin.setRole(UserRole.SUPER_ADMIN);
                rootAdmin.setActive(true);

                // Gen Secret Key mặc định cho Root Admin
                String secretKey = UUID.randomUUID().toString().replace("-", "") +
                        UUID.randomUUID().toString().replace("-", "").substring(0, 16);
                rootAdmin.setProvisionSecret(secretKey);

                tenantRepository.save(rootAdmin);
                log.info("Đã tạo thành công tài khoản Super Admin mặc định trong bảng Tenant: {}", rootEmail);

            } catch (Exception e) {
                log.error("Lỗi khi khởi tạo tài khoản Super Admin: {}", e.getMessage(), e);
            }
        } else {
            log.info("Tài khoản Super Admin đã tồn tại. Bỏ qua bước khởi tạo.");
        }
    }
}