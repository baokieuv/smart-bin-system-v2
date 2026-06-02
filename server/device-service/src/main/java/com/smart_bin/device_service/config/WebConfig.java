package com.smart_bin.device_service.config;

import com.smart_bin.device_service.interceptor.IpWhitelistInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final IpWhitelistInterceptor ipWhitelistInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
//        registry.addInterceptor(ipWhitelistInterceptor)
//                .addPathPatterns("/api/v1/things-board/**");
    }
}
