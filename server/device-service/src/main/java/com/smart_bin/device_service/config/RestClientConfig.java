package com.smart_bin.device_service.config;

import com.smart_bin.device_service.interceptor.ThingsBoardInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class RestClientConfig {

    @Value("${things-board.url}")
    private String baseUrl;

    @Value("${google.recaptcha.verify-url}")
    private String recaptchaVerifyUrl;

    @Bean("tbRestClient")
    public RestClient thingsBoardRestClient(ThingsBoardInterceptor authInterceptor) {

        var requestFactory = new BufferingClientHttpRequestFactory(new SimpleClientHttpRequestFactory());

        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .defaultHeader("Accept", MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .requestInterceptor(authInterceptor) // Nhúng quy trình tự động token vào đây
                .build();
    }

    @Bean("googleRestClient")
    public RestClient googleRestClient(){

        var requestFactory = new BufferingClientHttpRequestFactory(new SimpleClientHttpRequestFactory());

        return RestClient.builder()
                .baseUrl(recaptchaVerifyUrl)
                .requestFactory(requestFactory)
                .defaultHeader("Accept", MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();
    }
}
