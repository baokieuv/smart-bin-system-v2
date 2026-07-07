#include "ultrasonic_sensor.h"
#include "config.h"
#include "driver/gpio.h"
#include "esp_timer.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "ULTRASONIC";

extern SmartBinConfig_t system_config;

esp_err_t ultrasonic_sensor_init() {
    ESP_LOGI(TAG, "Khoi tao 4 cam bien sieu am (Chung Trigger)...");

    // 1. Cấu hình chân Trigger (Output)
    gpio_config_t trig_cfg = {
        .pin_bit_mask = (1ULL << ULTRASONIC_TRIG_PIN),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    esp_err_t err = gpio_config(&trig_cfg);
    if (err != ESP_OK) return err;

    // 2. Cấu hình 4 chân Echo (Input)
    gpio_config_t echo_cfg = {
        .pin_bit_mask = (1ULL << ULTRASONIC_ECHO1_PIN) | 
                        (1ULL << ULTRASONIC_ECHO2_PIN) | 
                        (1ULL << ULTRASONIC_ECHO3_PIN) | 
                        (1ULL << ULTRASONIC_ECHO4_PIN),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    err = gpio_config(&echo_cfg);
    if (err != ESP_OK) return err;

    // Đảm bảo Trigger ở mức LOW lúc bắt đầu
    gpio_set_level(ULTRASONIC_TRIG_PIN, 0);

    ESP_LOGI(TAG, "Khoi tao cam bien sieu am hoan tat.");
    return ESP_OK;
}

static uint32_t ultrasonic_sensor_read_raw(uint8_t echo_pin)
{
    // Trigger 10us
    gpio_set_level(ULTRASONIC_TRIG_PIN, 0);
    esp_rom_delay_us(2);

    gpio_set_level(ULTRASONIC_TRIG_PIN, 1);
    esp_rom_delay_us(10);

    gpio_set_level(ULTRASONIC_TRIG_PIN, 0);

    int64_t timeout_start = esp_timer_get_time();

    // Chờ Echo HIGH
    while (gpio_get_level(echo_pin) == 0)
    {
        if ((esp_timer_get_time() - timeout_start) > ECHO_TIMEOUT)
        {
            return 100;
        }
    }

    // Bắt đầu đo
    int64_t start_time = esp_timer_get_time();

    // Chờ Echo LOW
    while (gpio_get_level(echo_pin) == 1)
    {
        if ((esp_timer_get_time() - start_time) > ECHO_TIMEOUT)
        {
            return 100;
        }
    }

    // Kết thúc đo
    int64_t end_time = esp_timer_get_time();

    int64_t duration = end_time - start_time;

    // cm
    uint32_t distance = (duration * SOUND_SPEED) / 20000;

    return distance;
}

// Hàm lọc nhiễu Median cho 1 cảm biến
static uint32_t ultrasonic_read_median(uint8_t echo_pin) {
    uint32_t readings[5] = { 0 };
    int valid_count = 0;

    // Lấy 5 mẫu
    for(int i = 0; i < 5; i++){
        uint32_t distance = ultrasonic_sensor_read_raw(echo_pin);
        
        if(distance <= ULTRASONIC_MAX_DISTANCE){
            readings[valid_count++] = distance;
        }
        
        // Delay 30ms giữa các lần bắn xung để triệt tiêu âm vang còn sót lại trong thùng rác
        vTaskDelay(pdMS_TO_TICKS(30)); 
    }

    if (valid_count == 0) {
        return 100; // Không có dữ liệu hợp lệ
    }

    // Sắp xếp mảng (Bubble Sort)
    for (int i = 0; i < valid_count - 1; i++) {
        for (int j = i + 1; j < valid_count; j++) {
            if (readings[i] > readings[j]) {
                uint32_t temp = readings[i];
                readings[i] = readings[j];
                readings[j] = temp;
            }
        }
    }
    
    // Trả về giá trị ở giữa (Median)
    return readings[valid_count / 2];
}

// Hàm đọc toàn bộ 4 thùng
TrashBinDistances_t ultrasonic_read_all_bins() {
    TrashBinDistances_t bins;
    
    // Đọc tuần tự từng ngăn để tránh xung đột xung nhịp
    bins.bin1_cm = ultrasonic_read_median(ULTRASONIC_ECHO1_PIN);
    // bins.bin2_cm = ultrasonic_read_median(ULTRASONIC_ECHO2_PIN);
    // bins.bin3_cm = ultrasonic_read_median(ULTRASONIC_ECHO3_PIN);
    // bins.bin4_cm = ultrasonic_read_median(ULTRASONIC_ECHO4_PIN);
    bins.bin2_cm = 20; // Giả lập ngăn 2
    bins.bin3_cm = 20; // Giả lập ngăn 3
    bins.bin4_cm = 20; // Giả lập ngăn 4

    // ESP_LOGI(TAG, "K/C: Ngan1=%ucm, Ngan2=%ucm, Ngan3=%ucm, Ngan4=%ucm", 
    //          bins.bin1_cm, bins.bin2_cm, bins.bin3_cm, bins.bin4_cm);
             
    return bins;
}