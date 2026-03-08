package com.soict.smart_bin.interceptor;

import com.soict.smart_bin.common.ThingsBoardTokenManager;
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
public class ThingsBoardInterceptor implements ClientHttpRequestInterceptor {
    private final ThingsBoardTokenManager tokenManager;

    public ThingsBoardInterceptor(ThingsBoardTokenManager tokenManager) {
        this.tokenManager = tokenManager;
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
            return execution.execute(retryRequest, body);
        }

        return response;
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
