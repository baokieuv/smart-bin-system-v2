#include <stdio.h>
#include "esp_log.h"

#include "step_motor.h"
#include "gpio_handler.h"
#include "config.h"

#include "esp_err.h"
#include "esp_event.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define TAG_MAIN         "MAIN"

void app_main(void)
{
    ESP_LOGI(TAG_MAIN, "Initializing Stepper Motor...");
    
    gpio_handler_init();
    init_stepper();

    beep_pattern(2, 100);

    while (1) {
        ESP_LOGI(TAG_MAIN, "Spinning Clockwise...");
        step_motor(4096, 1, 5); 
        
        vTaskDelay(pdMS_TO_TICKS(1000));

        ESP_LOGI(TAG_MAIN, "Spinning Counter-Clockwise...");
        step_motor(4096, 0, 5);
        
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
