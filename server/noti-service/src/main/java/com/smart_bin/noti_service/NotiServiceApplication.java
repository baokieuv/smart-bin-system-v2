package com.smart_bin.noti_service;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@SpringBootApplication
@ComponentScan(basePackages = {"com.smart_bin.noti_service", "com.smart_bin.core"})
@EntityScan(basePackages = {"com.smart_bin.noti_service", "com.smart_bin.core"})
@EnableJpaAuditing
public class NotiServiceApplication {

	public static void main(String[] args) {
		SpringApplication.run(NotiServiceApplication.class, args);
	}

}