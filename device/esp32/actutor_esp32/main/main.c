#include "esp_log.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "gpio_handler.h"
#include "servo.h"
#include "step_motor.h"
#include "uart_handler.h"
#include "ultrasonic_sensor.h"
#include "nvs_storage.h"

static const char *TAG = "MAIN_APP";

SmartBinConfig_t system_config;
SmartBinState_t bin_state = BIN_STATE_NORMAL;

void sensor_report_task(void *arg){
    while(1) {
        TrashBinDistances_t dist = ultrasonic_read_all_bins();

        uint32_t fill_level[4] = {0};

        if (dist.bin1_cm > 0) fill_level[0] = dist.bin1_cm;
        if (dist.bin2_cm > 0) fill_level[1] = dist.bin2_cm;
        if (dist.bin3_cm > 0) fill_level[2] = dist.bin3_cm;
        if (dist.bin4_cm > 0) fill_level[3] = dist.bin4_cm;

        for(int i = 0; i < 4; i++) {
            if (fill_level[i] > 100) fill_level[i] = 100;
        }

        bool is_any_bin_full = false;
        for(int i = 0; i < 4; i++) {
            if (fill_level[i] <= system_config.full_threshold_pct) {
                is_any_bin_full = true;
                break;
            }
        }

        set_trash_full_alarm(is_any_bin_full);

        vTaskDelay(pdMS_TO_TICKS(5000));
    }
}

void app_main(void)
{
    // 1. Khởi tạo NVS cho OTA
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
      ESP_ERROR_CHECK(nvs_flash_erase());
      ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // esp_log_level_set("*", ESP_LOG_NONE);
    
    ESP_LOGI(TAG, "Khoi tao he thong Smart Bin v1.2...");

    if (nvs_load_bin_config(&system_config) != ESP_OK) {
        ESP_LOGW(TAG, "Cai dat mac dinh cho lan boot dau tien...");
        system_config.bin_depth_cm = 60.0;       // Sâu 60cm
        system_config.full_threshold_pct = 90;   // Ngưỡng 90%
        nvs_save_bin_config(&system_config);     // Lưu ngay xuống Flash
    }

    if (nvs_load_bin_state(&bin_state) != ESP_OK) {
        ESP_LOGW(TAG, "Cai dat mac dinh cho trang thai thung rac...");
        bin_state = BIN_STATE_NORMAL;
        nvs_save_bin_state(&bin_state);
    }
    
    // 2. Khởi tạo các module ngoại vi
    gpio_handler_init();
    init_stepper();
    init_servo();
    ultrasonic_sensor_init();
    
    // 3. Khởi tạo module truyền thông (Sẽ tự động tạo Queue và Task chạy ngầm)
    uart_handler_init();

    // 4. Set trạng thái ban đầu
    set_servo_angle(0);
    beep_pattern(2, 100);

    xTaskCreate(sensor_report_task, "sensor_report_task", 4086, NULL, 5, NULL);

    int16_t current_degree_request;

    // 5. Vòng lặp điều khiển chính (Application Layer)
    while (1) {
        if (xQueueReceive(step_action_queue, &current_degree_request, portMAX_DELAY) == pdPASS) {
            ESP_LOGI(TAG, "[ACT] 1. Step motor xoay: %d do", current_degree_request);
            step_motor_by_degree(current_degree_request, SPEED_DOUBLE);
            
            ESP_LOGI(TAG, "[ACT] 2. Servo mo 60 do");
            set_servo_angle(60);

            ESP_LOGI(TAG, "[ACT] 3. Dang cho 1.5s...");
            vTaskDelay(pdMS_TO_TICKS(1500));
            
            ESP_LOGI(TAG, "[ACT] 4. Servo dong ve 0 do");
            set_servo_angle(0);

            vTaskDelay(pdMS_TO_TICKS(300));
            
            ESP_LOGI(TAG, "[ACT] 5. Step motor xoay ve");
            step_motor_by_degree(-current_degree_request, SPEED_DOUBLE);
            
            ESP_LOGI(TAG, "[ACT] Chu trinh hoan tat.");
        }
    }
}