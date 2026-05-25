package com.smart_bin.iam_service.serivce;

import com.smart_bin.core.common.UserRole;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.iam_service.common.UserState;
import com.smart_bin.iam_service.dto.auth.request.LoginRequest;
import com.smart_bin.iam_service.dto.auth.response.TokenResponse;
import com.smart_bin.iam_service.dto.user.request.CreateUserRequest;
import com.smart_bin.iam_service.exception.AuthErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.RoleRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class KeycloakService {

    private final Keycloak keycloak;
    private final String realm;
    private final RestClient restClient;

    @Value("${keycloak.server-url}")
    private String serverUrl;

    @Value("${keycloak.client-id}")
    private String clientId;

    @Value("${keycloak.client-secret}")
    private String clientSecret;

    public KeycloakService(Keycloak keycloak, @Value("${keycloak.realm}") String keycloakRealm) {
        this.keycloak = keycloak;
        this.realm = keycloakRealm;
        this.restClient = RestClient.create();
    }

    public String createUser(CreateUserRequest request) {
        UserRepresentation user = new UserRepresentation();
        user.setEnabled(false);
        user.setUsername(request.email());
        user.setEmail(request.email());

        String[] names = splitName(request.name());
        user.setFirstName(names[0]);
        user.setLastName(names[1]);
        user.setEmailVerified(false);

        CredentialRepresentation credential = new CredentialRepresentation();
        credential.setType(CredentialRepresentation.PASSWORD);
        credential.setValue(request.password());
        credential.setTemporary(false);

        user.setCredentials(Collections.singletonList(credential));

        Map<String, List<String>> attributes = new HashMap<>();
        attributes.put("user_state", Collections.singletonList("PENDING"));
        user.setAttributes(attributes);

        try (jakarta.ws.rs.core.Response response = keycloak.realm(realm).users().create(user)) {
            if (response.getStatus() == 201) {
                String locationHeader = response.getHeaderString("Location");
                String userId = locationHeader.substring(locationHeader.lastIndexOf('/') + 1);

                updateRealmRole(userId, UserRole.USER);
                return userId;
            } else if (response.getStatus() == 409) {
                // HTTP 409 Conflict
                throw new ApiException(CoreErrorCode.BAD_REQUEST, "Email already exists in Keycloak");
            } else {
                log.error("Failed to create user in Keycloak. Status: {}", response.getStatus());
                throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Failed to create user in identity provider.");
            }
        } catch (ApiException e) {
            throw e; // Ném tiếp ApiException không cần bọc lại
        } catch (Exception e) {
            log.error("Error creating user in Keycloak", e);
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED);
        }
    }

    public String createTenantAdminAccount(String email, String password, String name) {
        UserRepresentation user = new UserRepresentation();
        user.setEnabled(true);
        user.setUsername(email);
        user.setEmail(email);

        String[] names = splitName(name);
        user.setFirstName(names[0]);
        user.setLastName(names[1]);
        user.setEmailVerified(true);

        CredentialRepresentation credential = new CredentialRepresentation();
        credential.setType(CredentialRepresentation.PASSWORD);
        credential.setValue(password);
        credential.setTemporary(false);

        user.setCredentials(Collections.singletonList(credential));

        try (jakarta.ws.rs.core.Response response = keycloak.realm(realm).users().create(user)) {
            if (response.getStatus() == 201) {
                String locationHeader = response.getHeaderString("Location");
                String userId = locationHeader.substring(locationHeader.lastIndexOf('/') + 1);
                updateRealmRole(userId, UserRole.ADMIN); // Gán role Tenant Admin
                return userId;
            } else if (response.getStatus() == 409) {
                throw new ApiException(CoreErrorCode.BAD_REQUEST, "Email Tenant đã tồn tại trên Identity Provider");
            } else {
                throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Failed to create Tenant in Keycloak");
            }
        }
    }

    // ... (Các code cũ của KeycloakService) ...

    public String createSuperAdminAccount(String email, String password, String name) {
        UserRepresentation user = new UserRepresentation();
        user.setEnabled(true);
        user.setUsername(email);
        user.setEmail(email);

        String[] names = splitName(name);
        user.setFirstName(names[0]);
        user.setLastName(names[1]);
        user.setEmailVerified(true);

        CredentialRepresentation credential = new CredentialRepresentation();
        credential.setType(CredentialRepresentation.PASSWORD);
        credential.setValue(password);
        credential.setTemporary(false);

        user.setCredentials(Collections.singletonList(credential));

        try (jakarta.ws.rs.core.Response response = keycloak.realm(realm).users().create(user)) {
            if (response.getStatus() == 201) {
                String locationHeader = response.getHeaderString("Location");
                String userId = locationHeader.substring(locationHeader.lastIndexOf('/') + 1);

                // Gán Role SUPER_ADMIN trên Keycloak
                updateRealmRole(userId, UserRole.SUPER_ADMIN);

                // Update attribute để đồng bộ trạng thái
                updateUserAttribute(userId, "user_state", UserState.ACTIVE.name());

                return userId;
            } else if (response.getStatus() == 409) {
                // Xử lý trường hợp Keycloak đã có user này (có thể do xóa DB nhưng chưa xóa Keycloak)
                log.warn("Tài khoản Super Admin đã tồn tại trên Keycloak Provider.");
                List<UserRepresentation> existingUsers = keycloak.realm(realm).users().search(email, true);
                return existingUsers.getFirst().getId();
            } else {
                throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Không thể tạo Super Admin trên Keycloak. Status: " + response.getStatus());
            }
        }
    }

    public void updateUserInfo(String userId, String name) {
        try {
            UserRepresentation user = keycloak.realm(realm).users().get(userId).toRepresentation();
            String[] names = splitName(name);
            user.setFirstName(names[0]);
            user.setLastName(names[1]);
            keycloak.realm(realm).users().get(userId).update(user);
        } catch (Exception e) {
            log.error("Error updating user info for {} in Keycloak", userId, e);
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Không thể cập nhật thông tin người dùng.");
        }
    }

    public void disableUser(String userId) {
        try {
            UserRepresentation user = keycloak.realm(realm).users().get(userId).toRepresentation();
            user.setEnabled(false);
            keycloak.realm(realm).users().get(userId).update(user);
            logoutAllSessions(userId); // Kick ra ngay lập tức
        } catch (Exception e) {
            log.error("Error disabling user {} in Keycloak", userId, e);
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Lỗi khi khóa tài khoản.");
        }
    }

    public void updateRealmRole(String userId, UserRole newRole) {
        try {
            var realmRoleResource = keycloak.realm(realm).users().get(userId).roles().realmLevel();
            List<RoleRepresentation> currentRoles = realmRoleResource.listAll();

            List<RoleRepresentation> rolesToRemove = currentRoles.stream()
                    .filter(r -> r.getName().equals(UserRole.RoleConstants.USER_LOWER)
                            || r.getName().equals(UserRole.RoleConstants.ADMIN_LOWER)
                            || r.getName().equals(UserRole.RoleConstants.SUPER_ADMIN_LOWER))
                    .toList();

            if (!rolesToRemove.isEmpty()) {
                realmRoleResource.remove(rolesToRemove);
            }

            RoleRepresentation roleToAdd = keycloak.realm(realm).roles().get(newRole.getRoleName()).toRepresentation();
            realmRoleResource.add(Collections.singletonList(roleToAdd));

        } catch (Exception e) {
            log.error("Error updating role to user {} in Keycloak", userId, e);
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Không thể cập nhật quyền người dùng.");
        }
    }

    public void updateUserAttribute(String userId, String key, String value) {
        try {
            UserRepresentation user = keycloak.realm(realm).users().get(userId).toRepresentation();

            // Khắc phục lỗi unmodifiable map bằng cách luôn tạo HashMap mới
            Map<String, List<String>> attributes = user.getAttributes() != null
                    ? new HashMap<>(user.getAttributes())
                    : new HashMap<>();

            attributes.put(key, Collections.singletonList(value));
            user.setAttributes(attributes);

            keycloak.realm(realm).users().get(userId).update(user);
        } catch (Exception e) {
            log.error("Error updating attribute {} for user {} in Keycloak", key, userId, e);
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Lỗi cập nhật thông tin hệ thống.");
        }
    }

    public void enableUser(String userId) {
        try {
            UserRepresentation user = keycloak.realm(realm).users().get(userId).toRepresentation();
            user.setEnabled(true);
            user.setEmailVerified(true);
            keycloak.realm(realm).users().get(userId).update(user);
        } catch (Exception e) {
            log.error("Error enabling user {} in Keycloak", userId, e);
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Lỗi khi kích hoạt tài khoản.");
        }
    }

    public TokenResponse login(LoginRequest request) {
        try {
            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("grant_type", "password");
            body.add("client_id", clientId);
            body.add("client_secret", clientSecret);
            body.add("username", request.username());
            body.add("password", request.password());

            return fetchToken(body);
        } catch (RestClientResponseException e) {
            log.warn("Invalid credentials for user: {}", request.username());
            throw new ApiException(AuthErrorCode.UNAUTHORIZED, "Email hoặc mật khẩu không chính xác.");
        } catch (Exception e) {
            log.error("Error during login for user: {}", request.username(), e);
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Lỗi hệ thống khi đăng nhập.");
        }
    }

    public TokenResponse exchangeGoogleToken(String googleToken) {
        try {
            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("grant_type", "urn:ietf:params:oauth:grant-type:token-exchange");
            body.add("client_id", clientId);
            body.add("client_secret", clientSecret);
            body.add("subject_token", googleToken);
            body.add("subject_issuer", "google");
            body.add("subject_token_type", "urn:ietf:params:oauth:token-type:access_token");
            body.add("requested_token_type", "urn:ietf:params:oauth:token-type:refresh_token");
            body.add("scope", "openid email profile offline_access");

            return fetchToken(body);
        } catch (RestClientResponseException e) {
            log.error("Failed to exchange Google token. Keycloak response: {}", e.getResponseBodyAsString());
            throw new ApiException(AuthErrorCode.GOOGLE_AUTH_FAILED);
        } catch (Exception e) {
            log.error("Error during Google token exchange", e);
            throw new ApiException(CoreErrorCode.INTERNAL_SERVER_ERROR, "Lỗi hệ thống khi xác thực Google.");
        }
    }

    public TokenResponse refreshAccessToken(String refreshToken) {
        try {
            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("grant_type", "refresh_token");
            body.add("client_id", clientId);
            body.add("client_secret", clientSecret);
            body.add("refresh_token", refreshToken);

            return fetchToken(body);
        } catch (RestClientResponseException e) {
            log.warn("Refresh token expired or invalid");
            throw new ApiException(AuthErrorCode.UNAUTHORIZED, "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
        } catch (Exception e) {
            log.error("Error refreshing token", e);
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Lỗi làm mới phiên đăng nhập.");
        }
    }

    public void logout(String refreshToken) {
        try {
            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("client_id", clientId);
            body.add("client_secret", clientSecret);
            body.add("refresh_token", refreshToken);

            restClient.post()
                    .uri(serverUrl + "/realms/" + realm + "/protocol/openid-connect/logout")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException e) {
            log.warn("Failed to logout from Keycloak: {}", e.getResponseBodyAsString());
            // Có thể bỏ qua ném lỗi ở đây để người dùng vẫn logout được ở client side
        } catch (Exception e) {
            log.error("Error during logout", e);
        }
    }

    public void updatePassword(String userId, String newPassword) {
        try {
            CredentialRepresentation credential = new CredentialRepresentation();
            credential.setType(CredentialRepresentation.PASSWORD);
            credential.setValue(newPassword);
            credential.setTemporary(false);

            keycloak.realm(realm).users().get(userId).resetPassword(credential);
        } catch (Exception e) {
            log.error("Error updating password in Keycloak for user {}", userId, e);
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Không thể cập nhật mật khẩu.");
        }
    }

    public void updateUserInfo(String userId, String firstName, String lastName) {
        try {
            UserRepresentation user = keycloak.realm(realm).users().get(userId).toRepresentation();

            if (firstName != null && !firstName.isBlank()) {
                user.setFirstName(firstName.trim());
            }
            if (lastName != null) {
                user.setLastName(lastName.trim());
            }

            keycloak.realm(realm).users().get(userId).update(user);
        } catch (Exception e) {
            log.error("Error updating user info for {} in Keycloak", userId, e);
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Không thể cập nhật thông tin người dùng.");
        }
    }

    public void logoutAllSessions(String userId) {
        try {
            keycloak.realm(realm).users().get(userId).logout();
        } catch (Exception e) {
            log.error("Error logging out sessions in Keycloak for user {}", userId, e);
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Lỗi khi đăng xuất các phiên.");
        }
    }

    public void deleteUser(String userId) {
        try {
            keycloak.realm(realm).users().get(userId).remove();
        } catch (Exception e) {
            log.error("Error deleting user {} from Keycloak", userId, e);
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Lỗi xóa tài khoản.");
        }
    }

    private TokenResponse fetchToken(MultiValueMap<String, String> body) {
        Map response = restClient.post()
                .uri(serverUrl + "/realms/" + realm + "/protocol/openid-connect/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(body)
                .retrieve()
                .body(Map.class);

        if (response == null) {
            throw new ApiException(AuthErrorCode.KEYCLOAK_OPERATION_FAILED, "Hệ thống xác thực không phản hồi.");
        }

        return new TokenResponse(
                (String) response.get("access_token"),
                (String) response.get("refresh_token"),
                (Integer) response.get("expires_in"),
                (Integer) response.get("refresh_expires_in"),
                (String) response.get("token_type")
        );
    }

    private String[] splitName(String name) {
        String firstName = "";
        String lastName = "";
        if (name != null && !name.trim().isEmpty()) {
            String[] parts = name.trim().split(" ", 2);
            firstName = parts[0];
            if (parts.length > 1) {
                lastName = parts[1];
            }
        }
        return new String[]{firstName, lastName};
    }
}