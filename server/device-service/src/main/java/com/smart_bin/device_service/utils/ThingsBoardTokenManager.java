package com.smart_bin.device_service.utils;

import com.smart_bin.device_service.dto.request.LoginRequest;
import com.smart_bin.device_service.dto.request.RefreshTokenRequest;
import com.smart_bin.device_service.dto.response.LoginResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

@Configuration
public class ThingsBoardTokenManager {

    private final String email;

    private final String password;

    private final RestClient authClient;

    private String jwtToken;
    private String refreshToken;

    public ThingsBoardTokenManager(
            @Value("${things-board.url}") String baseUrl,
            @Value("${things-board.email}") String email,
            @Value("${things-board.password}") String password)
    {
        this.email = email;
        this.password = password;

        this.authClient = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("Accept", "application/json")
                .defaultHeader("Content-Type", "application/json")
                .build();
    }

    public synchronized String getJwtToken() {
        if (this.jwtToken == null) {
            login();
        }
        return this.jwtToken;
    }

    public synchronized void handleUnauthorized() {
        if (this.refreshToken != null) {
            try {
                refresh();
                return;
            } catch (RestClientResponseException e) {
                // Refresh token hết hạn -> rơi xuống hàm login
            }
        }
        login();
    }

    private void login() {
        JsonNode response = authClient.post()
                .uri("/api/auth/login")
                .body(new LoginRequest(email, password))
                .retrieve()
                .body(JsonNode.class);

        if (response != null) {
            this.jwtToken = response.get("token").asText();
            this.refreshToken = response.get("refreshToken").asText();
        }
    }

    private void refresh() {
        LoginResponse response = authClient.post()
                .uri("/api/auth/token")
                .body(new RefreshTokenRequest(this.refreshToken))
                .retrieve()
                .body(LoginResponse.class);

        if (response != null) {
            this.jwtToken = response.token();
            this.refreshToken = response.refreshToken();
        }
    }

}
