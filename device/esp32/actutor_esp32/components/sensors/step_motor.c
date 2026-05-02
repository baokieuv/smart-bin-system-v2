#include "step_motor.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

gpio_num_t motor_pins[4] = {IN1, IN2, IN3, IN4};

int step_sequence[8][4] = {
    {1, 0, 0, 0},
    {1, 1, 0, 0},
    {0, 1, 0, 0},
    {0, 1, 1, 0},
    {0, 0, 1, 0},
    {0, 0, 1, 1},
    {0, 0, 0, 1},
    {1, 0, 0, 1}
};

esp_err_t init_stepper(){
    for(int i = 0; i < 4; i++){
        gpio_reset_pin(motor_pins[i]);
        gpio_set_direction(motor_pins[i], GPIO_MODE_OUTPUT);
        gpio_set_level(motor_pins[i], 0);
    }
    return ESP_OK;
}

void step_motor(int steps, int direction, int delay_ms){
    int step_index = 0;

    for(int i = 0; i < steps; i++){
        for(int pin = 0; pin < 4; pin++){
            gpio_set_level(motor_pins[pin], step_sequence[step_index][pin]);
        }

        if (direction == 1){
            step_index++;
            if (step_index > 7) step_index = 0;
        } else {
            step_index--;
            if (step_index < 0) step_index = 7;
        }

        vTaskDelay(pdMS_TO_TICKS(delay_ms));
    }

    for (int pin = 0; pin < 4; pin++) {
        gpio_set_level(motor_pins[pin], 0);
    }
}