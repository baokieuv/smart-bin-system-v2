package com.soict.smart_bin.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.util.matcher.IpAddressMatcher; // Cần thư viện spring-security-web
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.List;
import java.util.stream.Collectors;

@Component
@Slf4j
public class IpWhitelistInterceptor implements HandlerInterceptor {

    private final List<IpAddressMatcher> matchers;

    public IpWhitelistInterceptor(@Value("${app.webhook.allowed-ips}") List<String> allowedIps) {
        this.matchers = allowedIps.stream()
                .map(IpAddressMatcher::new)
                .collect(Collectors.toList());
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String clientIp = getClientIp(request);

        boolean isAllowed = matchers.stream()
                .anyMatch(matcher -> matcher.matches(clientIp));

        if (isAllowed) {
            return true;
        }

        log.warn("Blocked request from unauthorized IP: {}. Allowed ranges: {}", clientIp, matchers);
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"error\": \"Access Denied\", \"message\": \"IP " + clientIp + " is not whitelisted.\"}");
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