package com.soict.smart_bin.service;


import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.soict.smart_bin.dto.auth.LoginRequest;
import com.soict.smart_bin.dto.auth.TokenResponse;
import com.soict.smart_bin.dto.user.CreateUserRequest;
import okhttp3.*;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.representations.idm.UserRepresentation;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

@Service
public class KeycloakService {

    private final Keycloak keycloak;
    private final String realm;
    private final OkHttpClient client = new OkHttpClient();

    @Value("${keycloak.server-url}")
    private String serverUrl;

    @Value("${keycloak.client-id}")
    private String clientId;

    @Value("${keycloak.client-secret}")
    private String clientSecret;

    public KeycloakService(Keycloak keycloak, String keycloakRealm) {
        this.keycloak = keycloak;
        this.realm = keycloakRealm;
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
            RequestBody body = new FormBody.Builder()
                    .add("grant_type", "password")
                    .add("client_id", clientId)
                    .add("client_secret", clientSecret)
                    .add("username", request.email())
                    .add("password", request.password())
                    .build();

            Request req = new Request.Builder()
                    .url(serverUrl + "/realms/" + realm + "/protocol/openid-connect/token")
                    .post(body)
                    .build();

            try (Response response = client.newCall(req).execute()) {
                String responseBody = Objects.requireNonNull(response.body()).string();

                if (!response.isSuccessful()) {
                    throw new RuntimeException("Invalid credentials");
                }

                JsonObject json = new Gson().fromJson(responseBody, JsonObject.class);

                return new TokenResponse(
                        json.get("access_token").getAsString(),
                        json.get("refresh_token").getAsString(),
                        json.get("expires_in").getAsInt(),
                        json.get("refresh_expires_in").getAsInt(),
                        json.get("token_type").getAsString()
                );
            }
        } catch (IOException e) {
            throw new RuntimeException("Error during login: " + e.getMessage());
        }
    }

    public TokenResponse exchangeGoogleToken(String googleToken) {
        try {
            RequestBody body = new FormBody.Builder()
                    .add("grant_type", "urn:ietf:params:oauth:grant-type:token-exchange")
                    .add("client_id", clientId)
                    .add("client_secret", clientSecret)
                    .add("subject_token", googleToken)
                    .add("subject_issuer", "google")
                    .add("subject_token_type", "urn:ietf:params:oauth:token-type:access_token")
                    .add("requested_token_type", "urn:ietf:params:oauth:token-type:refresh_token") // ← thêm
                    .add("scope", "openid email profile offline_access") // ← thêm offline_access
                    .build();

            Request req = new Request.Builder()
                    .url(serverUrl + "/realms/" + realm + "/protocol/openid-connect/token")
                    .post(body)
                    .build();

            try (Response response = client.newCall(req).execute()) {
                String responseBody = Objects.requireNonNull(response.body()).string();

                if (!response.isSuccessful()) {
                    throw new RuntimeException("Failed to exchange Google token: " + responseBody);
                }

                JsonObject json = new Gson().fromJson(responseBody, JsonObject.class);

                return new TokenResponse(
                        json.get("access_token").getAsString(),
                        json.get("refresh_token").getAsString(),
                        json.get("expires_in").getAsInt(),
                        json.get("refresh_expires_in").getAsInt(),
                        json.get("token_type").getAsString()
                );
            }
        } catch (IOException e) {
            throw new RuntimeException("Error during Google token exchange: " + e.getMessage());
        }
    }

    public TokenResponse refreshAccessToken(String refreshToken) {
        try {
            RequestBody body = new FormBody.Builder()
                    .add("grant_type", "refresh_token")
                    .add("client_id", clientId)
                    .add("client_secret", clientSecret)
                    .add("refresh_token", refreshToken)
                    .build();

            Request req = new Request.Builder()
                    .url(serverUrl + "/realms/" + realm + "/protocol/openid-connect/token")
                    .post(body)
                    .build();

            try (Response response = client.newCall(req).execute()) {
                String responseBody = Objects.requireNonNull(response.body()).string();

                if (!response.isSuccessful()) {
                    throw new RuntimeException("Invalid or expired refresh token");
                }

                JsonObject json = new Gson().fromJson(responseBody, JsonObject.class);

                return new TokenResponse(
                        json.get("access_token").getAsString(),
                        json.get("refresh_token").getAsString(),
                        json.get("expires_in").getAsInt(),
                        json.get("refresh_expires_in").getAsInt(),
                        json.get("token_type").getAsString()
                );
            }
        } catch (Exception e) {
            throw new RuntimeException("Error refreshing token: " + e.getMessage());
        }
    }

    public void logout(String refreshToken) {
        try {
            RequestBody body = new FormBody.Builder()
                    .add("client_id", clientId)
                    .add("client_secret", clientSecret)
                    .add("refresh_token", refreshToken)
                    .build();

            Request req = new Request.Builder()
                    .url(serverUrl + "/realms/" + realm + "/protocol/openid-connect/logout")
                    .post(body)
                    .build();

            try (Response response = client.newCall(req).execute()) {
                if (!response.isSuccessful()) {
                    throw new RuntimeException("Failed to logout from Keycloak");
                }
            }
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
}