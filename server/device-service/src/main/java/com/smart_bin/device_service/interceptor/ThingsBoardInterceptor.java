package com.smart_bin.device_service.interceptor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import com.smart_bin.device_service.utils.ThingsBoardTokenManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.client.support.HttpRequestWrapper;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@Slf4j
public class ThingsBoardInterceptor implements ClientHttpRequestInterceptor {
    private final ThingsBoardTokenManager tokenManager;
    private final ObjectMapper objectMapper;

    public ThingsBoardInterceptor(ThingsBoardTokenManager tokenManager, ObjectMapper objectMapper) {
        this.tokenManager = tokenManager;
        this.objectMapper = objectMapper;
    }

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution) throws IOException {
        // 1. Lấy token hiện tại và gắn vào Request
        String currentToken = tokenManager.getJwtToken();
        HttpRequest authorizedRequest = withBearerToken(request, currentToken);

        ClientHttpResponse response = execution.execute(authorizedRequest, body);

        // 2. Nếu token hết hạn (401)
        if (response.getStatusCode() == HttpStatus.UNAUTHORIZED) {
            response.close(); // Đóng connection cũ

            // Yêu cầu TokenManager làm mới token
            tokenManager.handleUnauthorized();

            // Lấy token mới và thử gọi lại (Retry)
            String newToken = tokenManager.getJwtToken();
            HttpRequest retryRequest = withBearerToken(request, newToken);
            response = execution.execute(retryRequest, body);
        }

        // 3. Xử lý tập trung các mã lỗi HTTP (4xx, 5xx) từ ThingsBoard
        if (response.getStatusCode().is4xxClientError() || response.getStatusCode().is5xxServerError()) {
            handleThingsBoardError(response);
        }

        return response;
    }

    private void handleThingsBoardError(ClientHttpResponse response) throws IOException {
        byte[] errorBytes = response.getBody().readAllBytes();
        String errorString = new String(errorBytes);

        log.error("ThingsBoard API Error: Status={}, Body={}", response.getStatusCode(), errorString);

        JsonNode errorJson = null;
        String errorMessage = "Lỗi hệ thống khi giao tiếp với ThingsBoard";

        try {
            // Parse String thành JSON
            errorJson = objectMapper.readTree(errorBytes);

            // Lấy field "message" do ThingsBoard trả về (ví dụ: "Device with such name already exists!")
            if (errorJson != null && errorJson.has("message")) {
                errorMessage = errorJson.get("message").asText();
            }
        } catch (Exception e) {
            log.warn("Không thể parse error response từ ThingsBoard sang JSON", e);
        }

        // Ném lỗi ra để GlobalExceptionHandler bắt lấy và trả về client
        throw new ApiException(CoreErrorCode.EXTERNAL_API_ERROR, errorJson);
    }

    private HttpRequest withBearerToken(HttpRequest request, String token) {
        return new HttpRequestWrapper(request) {
            @Override
            public HttpHeaders getHeaders() {
                HttpHeaders headers = new HttpHeaders();
                headers.putAll(super.getHeaders());
                if (token != null) {
                    headers.setBearerAuth(token);
                }
                return headers;
            }
        };
    }
}
