package com.smart_bin.iam_service.serivce;

import com.fasterxml.jackson.databind.JsonNode;
import com.smart_bin.iam_service.dto.auth.request.LoginRequest;
import com.smart_bin.iam_service.dto.auth.response.TokenResponse;
import com.smart_bin.iam_service.dto.user.request.CreateUserRequest;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.Collections;
import java.util.List;

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

        try (jakarta.ws.rs.core.Response response =
                     keycloak.realm(realm).users().create(user)) {

            if (response.getStatus() == 201) {
                String locationHeader = response.getHeaderString("Location");
                return locationHeader.substring(locationHeader.lastIndexOf('/') + 1);
            } else if (response.getStatus() == 409) {
                throw new RuntimeException("Email already exists in Keycloak");
            } else {
                throw new RuntimeException("Failed to create user in Keycloak. Status: " + response.getStatus());
            }
        } catch (Exception e) {
            throw new RuntimeException("Error creating user in Keycloak: " + e.getMessage());
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

    public void deleteUser(String userId) {
        try {
            keycloak.realm(realm).users().get(userId).remove();
        } catch (Exception e) {
            throw new RuntimeException("Error deleting user from Keycloak: " + e.getMessage());
        }
    }

    // --- Hàm hỗ trợ dùng chung để giảm lặp code (DRY) ---
    private TokenResponse fetchToken(MultiValueMap<String, String> body) {
        JsonNode responseNode = restClient.post()
                .uri(serverUrl + "/realms/" + realm + "/protocol/openid-connect/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(body)
                .retrieve()
                .body(JsonNode.class);

        if (responseNode == null) {
            throw new RuntimeException("Empty response from Keycloak");
        }

        return new TokenResponse(
                responseNode.path("access_token").asText(),
                responseNode.path("refresh_token").asText(),
                responseNode.path("expires_in").asInt(),
                responseNode.path("refresh_expires_in").asInt(),
                responseNode.path("token_type").asText()
        );
    }
}