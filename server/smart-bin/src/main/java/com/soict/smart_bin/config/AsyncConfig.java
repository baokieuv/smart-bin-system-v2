package com.soict.smart_bin.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
@EnableAsync // BẬT TÍNH NĂNG CHẠY NGẦM CHO TOÀN BỘ PROJECT
public class AsyncConfig {

    @Bean(name = "emailExecutor")
    public Executor emailExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2); // Số luồng luôn túc trực
        executor.setMaxPoolSize(5);  // Số luồng tối đa khi có quá nhiều người đăng ký cùng lúc
        executor.setQueueCapacity(50); // Hàng đợi (nếu cả 5 luồng đều bận thì cho 50 mail vào hàng chờ)
        executor.setThreadNamePrefix("EmailSender-"); // Tên luồng để dễ debug trong log
        executor.initialize();
        return executor;
    }
}