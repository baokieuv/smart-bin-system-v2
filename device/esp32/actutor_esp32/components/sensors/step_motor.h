#ifndef STEP_MOTOR_H
#define STEP_MOTOR_H

#include "config.h"
#include "driver/gpio.h"

#define TAG_MOTOR     "STEPPER"

extern gpio_num_t motor_pins[4];
extern int step_sequence[8][4];

esp_err_t init_stepper();

void step_motor(int steps, int direction, int delay_ms);

#endif // STEP_MOTOR_H