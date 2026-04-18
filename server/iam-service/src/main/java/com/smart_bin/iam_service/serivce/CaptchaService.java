package com.smart_bin.iam_service.serivce;

import com.smart_bin.iam_service.dto.auth.response.RecaptchaResponse;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

@Service
public class CaptchaService {
    @Value("${google.recaptcha.secret}")
    private String recaptchaSecret;

    @Value("${google.recaptcha.threshold}")
    private double scoreThreshold;

    private final RestClient googleRestClient;

    public CaptchaService(
            @Qualifier("googleRestClient") RestClient restClient
    ){
        this.googleRestClient = restClient;
    }

    public boolean isValidCaptcha(String captchaToken, String expectedAction) {
        if (captchaToken == null || captchaToken.isBlank()) {
            return false;
        }

        // Google yêu cầu gửi data dưới dạng Form URL Encoded
        MultiValueMap<String, String> requestBody = new LinkedMultiValueMap<>();
        requestBody.add("secret", recaptchaSecret);
        requestBody.add("response", captchaToken);

        try {
            // Gọi API sang Google
            RecaptchaResponse response = googleRestClient
                    .post()
                    .uri("/recaptcha/api/siteverify")
                    .body(requestBody)
                    .retrieve()
                    .body(RecaptchaResponse.class);

            // Kiểm tra: Phải thành công + Điểm số >= 0.5 + Đúng action mình mong muốn
            return response != null
                    && response.success()
                    && response.score() >= scoreThreshold
                    && response.action().equals(expectedAction);

        } catch (Exception e) {
            // Log lỗi nếu cần thiết
            return false; // Nếu gọi API lỗi, coi như fail để bảo vệ hệ thống
        }
    }
}
