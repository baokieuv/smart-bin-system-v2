#ifndef STEP_MOTOR_H
#define STEP_MOTOR_H

#include "config.h"

esp_err_t init_stepper();

void step_motor(int steps, int direction, int delay_ms, StepperSpeed_t speed);

void step_motor_by_degree(int degree, StepperSpeed_t speed);

#endif // STEP_MOTOR_H