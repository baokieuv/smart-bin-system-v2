package com.smart_bin.product_service.config;

import com.smart_bin.product_service.interceptor.InternalApiKeyInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final InternalApiKeyInterceptor internalApiKeyInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Chỉ áp dụng cho các API gọi nội bộ của Inventory
        registry.addInterceptor(internalApiKeyInterceptor)
                .addPathPatterns("/api/v1/inventories/reserve");
    }
}
