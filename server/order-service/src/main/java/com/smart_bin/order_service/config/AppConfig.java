package com.smart_bin.order_service.config;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class AppConfig {

    @Bean
    @Primary // Đánh dấu đây là Bean ưu tiên để Spring luôn lấy nó khi inject
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();

        // Đăng ký module hỗ trợ xử lý ngày tháng (LocalDate, LocalDateTime) của Java 8+
        mapper.registerModule(new JavaTimeModule());

        // Tắt lỗi nếu JSON gửi lên có chứa các field lạ (không có trong DTO)
        mapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

        // Ghi log ngày tháng dưới dạng chuẩn ISO-8601 thay vì dạng số (timestamp)
        mapper.configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false);

        return mapper;
    }
}
