package com.smart_bin.core.dto; // Hoặc package phù hợp của bạn

import lombok.Getter;
import lombok.Setter;

import java.io.Serializable;
import java.util.List;

@Getter
@Setter
public class PageResponseDto<T> implements Serializable {
    private List<T> content;
    private int pageNumber;
    private int pageSize;
    private long totalElements;
    private int totalPages;

    // Bắt buộc phải có Default Constructor cho Jackson
    public PageResponseDto() {
    }

    // Constructor để map nhanh từ Spring Page
    public PageResponseDto(org.springframework.data.domain.Page<T> page) {
        this.content = page.getContent();
        this.pageNumber = page.getNumber() + 1; // Spring page bắt đầu từ 0, API thường từ 1
        this.pageSize = page.getSize();
        this.totalElements = page.getTotalElements();
        this.totalPages = page.getTotalPages();
    }
}