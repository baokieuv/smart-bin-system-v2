#include "nvs_storage.h"
#include "nvs_flash.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "NVS_STORAGE";

esp_err_t nvs_save_bin_config(const SmartBinConfig_t *config) {
    if (!config) return ESP_ERR_INVALID_ARG;

    nvs_handle_t nvs;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &nvs);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Lỗi mở NVS: %s", esp_err_to_name(err));
        return err;
    }

    // Lưu toàn bộ struct dưới dạng Blob (khối byte)
    err = nvs_set_blob(nvs, NVS_KEY_CONFIG, config, sizeof(SmartBinConfig_t));
    
    if (err == ESP_OK) {
        err = nvs_commit(nvs);
        ESP_LOGI(TAG, "Da luu cau hinh vao Flash: Depth=%.1fcm, Thresh=%d%%", 
                 config->bin_depth_cm, config->full_threshold_pct);
    } else {
        ESP_LOGE(TAG, "Loi khi luu Blob: %s", esp_err_to_name(err));
    }

    nvs_close(nvs);
    return err;
}

esp_err_t nvs_load_bin_config(SmartBinConfig_t *config) {
    if (!config) return ESP_ERR_INVALID_ARG;

    nvs_handle_t nvs;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &nvs);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "NVS chua duoc khoi tao hoac chua co data.");
        return err;
    }

    size_t required_size = sizeof(SmartBinConfig_t);
    err = nvs_get_blob(nvs, NVS_KEY_CONFIG, config, &required_size);

    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Da tai cau hinh tu Flash: Depth=%.1fcm, Thresh=%d%%", 
                 config->bin_depth_cm, config->full_threshold_pct);
    } else {
        ESP_LOGW(TAG, "Khong tim thay cau hinh trong Flash, se dung mac dinh.");
    }

    if (config->bin_depth_cm <= 1.0f || config->full_threshold_pct <= 0){
        err = ESP_ERR_INVALID_STATE;
    }

    nvs_close(nvs);
    return err;
}

esp_err_t nvs_clear_config(void) {
    nvs_handle_t nvs;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &nvs);
    if (err != ESP_OK) return err;

    err = nvs_erase_all(nvs);
    if (err == ESP_OK) nvs_commit(nvs);

    nvs_close(nvs);
    ESP_LOGI(TAG, "Da xoa toan bo cau hinh NVS.");
    return err;
}