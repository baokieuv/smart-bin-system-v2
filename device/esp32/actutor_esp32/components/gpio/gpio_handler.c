#include "gpio_handler.h"
#include "driver/gpio.h"
#include "esp_log.h"

static const char *TAG = "GPIO";

volatile AlarmState_t current_alarm_state = ALARM_IDLE;
TaskHandle_t alarm_task_handle = NULL;

static uint32_t last_button_press_time = 0;

static void IRAM_ATTR button_isr_handler(void* arg) {
    uint32_t current_time = xTaskGetTickCountFromISR();
    
    // Chống dội phím (Debounce 300ms)
    if (current_time - last_button_press_time > pdMS_TO_TICKS(300)) {
        // Nếu đang kêu Buzzer, chuyển sang nháy LED
        if (current_alarm_state == ALARM_BUZZING) {
            current_alarm_state = ALARM_BLINKING;
        }
        last_button_press_time = current_time;
    }
}

void alarm_task(void *arg) {
    while(1){
        switch (current_alarm_state)
        {
        case ALARM_BUZZING:
            gpio_set_level(LED_PIN, 0);
            gpio_set_level(BUZZER_PIN, 1);
            vTaskDelay(pdMS_TO_TICKS(500)); // Kêu 0.5s
            gpio_set_level(BUZZER_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(500)); // Nghỉ 0.5s
            break;
        case ALARM_BLINKING:
            gpio_set_level(BUZZER_PIN, 0);
            gpio_set_level(LED_PIN, 1);
            vTaskDelay(pdMS_TO_TICKS(200));
            gpio_set_level(LED_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(200));
            break;
        case ALARM_IDLE:
        default:
            gpio_set_level(BUZZER_PIN, 0);
            gpio_set_level(LED_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(200));
            break;
        }
    }

}

esp_err_t gpio_handler_init() {
    ESP_LOGI(TAG, "Initializing GPIO...");

    // 1. Cấu hình Buzzer
    gpio_reset_pin(BUZZER_PIN);
    gpio_set_direction(BUZZER_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(BUZZER_PIN, 0);

    // 2. Cấu hình LED
    gpio_reset_pin(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_PIN, 0);

    // 3. Cấu hình Nút bấm (Kéo lên nguồn, kích hoạt ngắt cạnh xuống)
    gpio_config_t btn_config = {
        .pin_bit_mask = (1ULL << BUTTON_PIN),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_NEGEDGE // Kích hoạt ngắt khi nhấn xuống (kéo GND)
    };
    gpio_config(&btn_config);

    // Cài đặt dịch vụ ngắt GPIO
    gpio_install_isr_service(0);
    // Gắn hàm ISR cho nút bấm
    gpio_isr_handler_add(BUTTON_PIN, button_isr_handler, NULL);

    // 4. Tạo Task ngầm để xử lý cảnh báo
    xTaskCreate(alarm_task, "alarm_task", 2048, NULL, 5, &alarm_task_handle);

    return ESP_OK;
}

void set_trash_full_alarm(bool is_full) {
    if (is_full) { 
        if (current_alarm_state == ALARM_IDLE) {
            current_alarm_state = ALARM_BUZZING;
            ESP_LOGW(TAG, "CANH BAO: Thung rac day! Phat am thanh.");
        }
    } else {
        current_alarm_state = ALARM_IDLE;
        ESP_LOGI(TAG, "Thung rac da duoc don. Tat canh bao.");
    }
}

void beep_pattern(int count, int duration){
    for(int i = 0; i < count; i++){
        gpio_set_level(BUZZER_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(duration));
        gpio_set_level(BUZZER_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(duration));
    }
}
