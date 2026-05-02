package com.smart_bin.iam_service.serivce;

import com.smart_bin.core.common.UserRole;
import com.smart_bin.iam_service.dto.auth.request.LoginRequest;
import com.smart_bin.iam_service.dto.auth.response.TokenResponse;
import com.smart_bin.iam_service.dto.user.request.CreateUserRequest;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.FederatedIdentityRepresentation;
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

    public KeycloakService(Keycloak keycloak, String keycloakRealm) {
        this.keycloak = keycloak;
        this.realm = keycloakRealm;
        this.restClient = RestClient.create();
    }

    public String createUser(CreateUserRequest request) {
        UserRepresentation user = new UserRepresentation();
        user.setEnabled(false);
        user.setUsername(request.email());
        user.setEmail(request.email());
        user.setFirstName(request.firstName());
        user.setLastName(request.lastName());
        user.setEmailVerified(false);

        CredentialRepresentation credential = new CredentialRepresentation();
        credential.setType(CredentialRepresentation.PASSWORD);
        credential.setValue(request.password());
        credential.setTemporary(false);

        user.setCredentials(Collections.singletonList(credential));

        Map<String, List<String>> attributes = new HashMap<>();
        attributes.put("user_state", Collections.singletonList("PENDING"));
        user.setAttributes(attributes);

        try (jakarta.ws.rs.core.Response response =
                     keycloak.realm(realm).users().create(user)) {

            if (response.getStatus() == 201) {
                String locationHeader = response.getHeaderString("Location");
                String userId = locationHeader.substring(locationHeader.lastIndexOf('/') + 1);

                updateRealmRole(userId, UserRole.USER);

                return userId;
            } else if (response.getStatus() == 409) {
                throw new RuntimeException("Email already exists in Keycloak");
            } else {
                throw new RuntimeException("Failed to create user in Keycloak. Status: " + response.getStatus());
            }
        } catch (Exception e) {
            throw new RuntimeException("Error creating user in Keycloak: " + e.getMessage());
        }
    }

    // Đổi tham số nhận vào thành UserRole
    public void updateRealmRole(String userId, UserRole newRole) {
        try {
            var realmRoleResource = keycloak.realm(realm).users().get(userId).roles().realmLevel();

            List<RoleRepresentation> currentRoles = realmRoleResource.listAll();

            // So sánh bằng hằng số của Enum thay vì chuỗi gõ tay
            List<RoleRepresentation> rolesToRemove = currentRoles.stream()
                    .filter(r -> r.getName().equals(UserRole.RoleConstants.USER_LOWER)
                            || r.getName().equals(UserRole.RoleConstants.ADMIN_LOWER)
                            || r.getName().equals(UserRole.RoleConstants.SUPER_ADMIN_LOWER))
                    .toList();

            if (!rolesToRemove.isEmpty()) {
                realmRoleResource.remove(rolesToRemove);
            }

            // Lấy tên role viết thường (user, admin, super_admin) để gán trên Keycloak
            RoleRepresentation roleToAdd = keycloak.realm(realm).roles().get(newRole.getRoleName()).toRepresentation();
            realmRoleResource.add(Collections.singletonList(roleToAdd));

        } catch (Exception e) {
            throw new RuntimeException("Error updating role to user in Keycloak: " + e.getMessage());
        }
    }

    public void updateUserAttribute(String userId, String key, String value) {
        try {
            UserRepresentation user = keycloak.realm(realm).users().get(userId).toRepresentation();

            Map<String, List<String>> attributes = user.getAttributes();
            if (attributes == null) {
                attributes = new HashMap<>();
            }
            attributes.put(key, Collections.singletonList(value));
            user.setAttributes(attributes);

            keycloak.realm(realm).users().get(userId).update(user);
        } catch (Exception e) {
            throw new RuntimeException("Error updating user attribute in Keycloak: " + e.getMessage());
        }
    }

    public void enableUser(String userId) {
        try {
            UserRepresentation user = keycloak.realm(realm).users().get(userId).toRepresentation();
            user.setEnabled(true);
            user.setEmailVerified(true);
            keycloak.realm(realm).users().get(userId).update(user);
        } catch (Exception e) {
            throw new RuntimeException("Error enabling user in Keycloak: " + e.getMessage());
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
            throw new RuntimeException("Invalid credentials: " + e.getResponseBodyAsString());
        } catch (Exception e) {
            throw new RuntimeException("Error during login: " + e.getMessage());
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
            throw new RuntimeException("Failed to exchange Google token: " + e.getResponseBodyAsString());
        } catch (Exception e) {
            throw new RuntimeException("Error during Google token exchange: " + e.getMessage());
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
            throw new RuntimeException("Invalid or expired refresh token: " + e.getResponseBodyAsString());
        } catch (Exception e) {
            throw new RuntimeException("Error refreshing token: " + e.getMessage());
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
                    .toBodilessEntity(); // Logout Keycloak thường trả về 204 No Content

        } catch (RestClientResponseException e) {
            throw new RuntimeException("Failed to logout from Keycloak: " + e.getResponseBodyAsString());
        } catch (Exception e) {
            throw new RuntimeException("Error during logout: " + e.getMessage());
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
            throw new RuntimeException("Error updating password in Keycloak: " + e.getMessage());
        }
    }

    public UserRepresentation getUserByEmail(String email) {
        try {
            List<UserRepresentation> users = keycloak.realm(realm)
                    .users()
                    .search(email, true);

            if (users.isEmpty()) {
                return null;
            }

            return users.getFirst();
        } catch (Exception e) {
            throw new RuntimeException("Error fetching user from Keycloak: " + e.getMessage());
        }
    }

    public UserRepresentation getUserById(String userId) {
        try {
            return keycloak.realm(realm).users().get(userId).toRepresentation();
        } catch (Exception e) {
            throw new RuntimeException("Error fetching user from Keycloak: " + e.getMessage());
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
            throw new RuntimeException("Error updating user info in Keycloak: " + e.getMessage());
        }
    }

    public void logoutAllSessions(String userId) {
        try {
            keycloak.realm(realm).users().get(userId).logout();
        } catch (Exception e) {
            throw new RuntimeException("Error logging out sessions in Keycloak: " + e.getMessage());
        }
    }


    public void deleteUser(String userId) {
        try {
            keycloak.realm(realm).users().get(userId).remove();
        } catch (Exception e) {
            throw new RuntimeException("Error deleting user from Keycloak: " + e.getMessage());
        }
    }

    public void linkIdentityProvider(String userId, String providerAlias, String providerUserId, String providerUsername) {
        try {
            FederatedIdentityRepresentation identity = new FederatedIdentityRepresentation();
            identity.setIdentityProvider(providerAlias); // truyền "google"
            identity.setUserId(providerUserId);          // Subject ID của Google Token
            identity.setUserName(providerUsername);      // Email

            keycloak.realm(realm).users().get(userId).addFederatedIdentity(providerAlias, identity);
        } catch (Exception e) {
            // Bỏ qua nếu tài khoản đã được link từ trước đó
            System.out.println("User is already linked or error: " + e.getMessage());
        }
    }

    // --- Hàm hỗ trợ dùng chung để giảm lặp code (DRY) ---
    private TokenResponse fetchToken(MultiValueMap<String, String> body) {
        // Sửa JsonNode.class thành Map.class
        Map response = restClient.post()
                .uri(serverUrl + "/realms/" + realm + "/protocol/openid-connect/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(body)
                .retrieve()
                .body(Map.class); // Thay đổi ở đây

        if (response == null) {
            throw new RuntimeException("Empty response from Keycloak");
        }

        // Lấy dữ liệu từ Map (ép kiểu an toàn)
        return new TokenResponse(
                (String) response.get("access_token"),
                (String) response.get("refresh_token"),
                (Integer) response.get("expires_in"),
                (Integer) response.get("refresh_expires_in"),
                (String) response.get("token_type")
        );
    }
}