#include "esp_log.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "gpio_handler.h"
#include "servo.h"
#include "step_motor.h"
#include "uart_handler.h"

static const char *TAG = "MAIN_APP";

void app_main(void)
{
    // 1. Khởi tạo NVS cho OTA
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
      ESP_ERROR_CHECK(nvs_flash_erase());
      ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_LOGI(TAG, "Khoi tao he thong Smart Bin v1.2...");

    // 2. Khởi tạo các module ngoại vi
    gpio_handler_init();
    init_stepper();
    init_servo();
    
    // 3. Khởi tạo module truyền thông (Sẽ tự động tạo Queue và Task chạy ngầm)
    uart_handler_init();

    // 4. Set trạng thái ban đầu
    set_servo_angle(0);
    beep_pattern(2, 100);

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