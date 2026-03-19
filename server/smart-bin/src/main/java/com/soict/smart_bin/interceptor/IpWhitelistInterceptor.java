package com.soict.smart_bin.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.List;

@Component
@Slf4j
public class IpWhitelistInterceptor implements HandlerInterceptor {

    @Value("${app.webhook.allowed-ips}")
    private List<String> allowedIps;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String clientIp = getClientIp(request);

        if (allowedIps.contains(clientIp)) {
            return true;
        }

        log.warn("Blocked request from unauthorized IP: {}", clientIp);
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.getWriter().write("Access Denied: Your IP is not whitelisted.");
        return false;
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }

        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }
}