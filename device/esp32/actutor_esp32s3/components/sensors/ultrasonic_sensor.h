#ifndef ULTRASONIC_SENSOR_H
#define ULTRASONIC_SENSOR_H

#include "esp_err.h"

typedef struct {
    uint32_t bin1_cm;
    uint32_t bin2_cm;
    uint32_t bin3_cm;
    uint32_t bin4_cm;
} TrashBinDistances_t;


/**
 * @brief Initialize ultrasonic sensor
 * @return ESP_OK on success
 */
esp_err_t ultrasonic_sensor_init();

/**
 * @brief Đọc khoảng cách (đã qua lọc nhiễu Median) của cả 4 ngăn
 * @return Struct chứa 4 giá trị khoảng cách (cm)
 */
TrashBinDistances_t ultrasonic_read_all_bins();

#endif