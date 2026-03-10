package com.soict.smart_bin.common;

import com.fasterxml.jackson.databind.JsonNode;
import com.soict.smart_bin.dto.auth.LoginRequest;
import com.soict.smart_bin.dto.auth.LoginResponse;
import com.soict.smart_bin.dto.auth.RefreshTokenRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Configuration
public class ThingsBoardTokenManager {

    @Value("${things-board.url}")
    private String baseUrl;

    @Value("${things-board.email}")
    private String email;

    @Value("${things-board.password}")
    private String password;

    private final RestClient authClient;

    private String jwtToken;
    private String refreshToken;

    public ThingsBoardTokenManager() {
        this.authClient = RestClient.builder()
                .baseUrl("http://localhost:8080")
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
