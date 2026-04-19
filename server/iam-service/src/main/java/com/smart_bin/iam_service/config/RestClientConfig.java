package com.smart_bin.iam_service.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class RestClientConfig {
    @Value("${google.recaptcha.verify-url}")
    private String recaptchaVerifyUrl;


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
