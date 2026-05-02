#include "gpio_handler.h"
#include "driver/gpio.h"
#include "esp_log.h"

#define TAG_GPIO        "GPIO"

esp_err_t gpio_handler_init() {
    ESP_LOGI(TAG_GPIO, "Initializing GPIO...");

    esp_err_t ret = ESP_OK;

    gpio_reset_pin(BUZZER);
    gpio_set_direction(BUZZER, GPIO_MODE_OUTPUT);
    gpio_set_level(BUZZER, 0);

    return ret;
}

void beep_pattern(int count, int duration){
    for(int i = 0; i < count; i++){
        gpio_set_level(BUZZER, 1);
        vTaskDelay(pdMS_TO_TICKS(duration));
        gpio_set_level(BUZZER, 0);
        vTaskDelay(pdMS_TO_TICKS(duration));
    }
}
