#ifndef NVS_STORAGE_H
#define NVS_STORAGE_H

#include <stdbool.h>
#include "esp_err.h"
#include "config.h"

/**
 * @brief Lưu toàn bộ cấu hình vào NVS Flash
 */
esp_err_t nvs_save_bin_config(const SmartBinConfig_t *config);

/**
 * @brief Tải cấu hình từ NVS Flash
 * @return ESP_OK nếu thành công, trả về lỗi nếu là lần boot đầu tiên (chưa có data)
 */
esp_err_t nvs_load_bin_config(SmartBinConfig_t *config);

/**
 * @brief Xóa trắng NVS
 */
esp_err_t nvs_clear_config(void);

#endif // NVS_STORAGE_H