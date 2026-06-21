#include "step_motor.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

gpio_num_t motor_pins[4] = {IN1, IN2, IN3, IN4};

const uint8_t step_sequence[8][4] = {
    {1, 0, 0, 0},
    {1, 1, 0, 0},
    {0, 1, 0, 0},
    {0, 1, 1, 0},
    {0, 0, 1, 0},
    {0, 0, 1, 1},
    {0, 0, 0, 1},
    {1, 0, 0, 1}};

const uint8_t step_sequence_4[4][4] = {
    {1, 1, 0, 0},
    {0, 1, 1, 0},
    {0, 0, 1, 1},
    {1, 0, 0, 1}};

esp_err_t init_stepper()
{
    for (int i = 0; i < 4; i++)
    {
        gpio_reset_pin(motor_pins[i]);
        gpio_set_direction(motor_pins[i], GPIO_MODE_OUTPUT);
        gpio_set_level(motor_pins[i], 0);
    }
    return ESP_OK;
}

void step_motor(int steps, int direction, int delay_ms, StepperSpeed_t speed)
{

    const uint8_t (*current_seq)[4];
    int num_of_steps_in_seq;

    if (speed == SPEED_DOUBLE)
    {
        current_seq = step_sequence_4;
        num_of_steps_in_seq = 4;
    }
    else
    {
        current_seq = step_sequence;
        num_of_steps_in_seq = 8;
    }

    int step_index = 0;

    int ticks_to_delay = pdMS_TO_TICKS(delay_ms);
    if (ticks_to_delay == 0)
        ticks_to_delay = 1;

    for (int i = 0; i < steps; i++)
    {
        for (int pin = 0; pin < 4; pin++)
        {
            gpio_set_level(motor_pins[pin], current_seq[step_index][pin]);
        }

        if (direction == 1)
        {
            step_index++;
            if (step_index >= num_of_steps_in_seq)
                step_index = 0;
        }
        else
        {
            step_index--;
            if (step_index < 0)
                step_index = num_of_steps_in_seq - 1;
        }

        // TODO use vTaskDelay
        esp_rom_delay_us(delay_ms * 1000);
    }

    for (int pin = 0; pin < 4; pin++)
    {
        gpio_set_level(motor_pins[pin], 0);
    }
}

void step_motor_by_degree(int degree, StepperSpeed_t speed)
{
    int direction = (degree >= 0) ? 1 : 0;
    int abs_degree = abs(degree);

    int steps = 0;

    if (speed == SPEED_DOUBLE)
    {
        // 360 độ = 2048 steps (Full-step) -> 1 độ ≈ 5.688 steps
        steps = (abs_degree * 256) / 45;
    }
    else
    {
        // 360 độ = 4096 steps -> 1 độ ≈ 11.377 steps
        steps = (abs_degree * 512) / 45;
    }

    // Tốc độ: 2ms/step
    step_motor(steps, direction, 2, speed);
}