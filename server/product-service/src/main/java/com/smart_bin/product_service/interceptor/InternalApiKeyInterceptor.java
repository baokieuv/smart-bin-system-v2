package com.smart_bin.product_service.interceptor;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.core.exception.CoreErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class InternalApiKeyInterceptor implements HandlerInterceptor {

    // Cấu hình key này trong application.yml hoặc biến môi trường
    @Value("${app.internal-key:SUPER_SECRET_INTERNAL_KEY}")
    private String internalKey;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String requestKey = request.getHeader("X-Internal-Key");

        if (requestKey == null || !requestKey.equals(internalKey)) {
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid or missing X-Internal-Key");
        }
        return true; // Cho phép đi tiếp vào Controller
    }
}
