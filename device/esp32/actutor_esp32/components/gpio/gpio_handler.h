#ifndef GPIO_HANDLER_H
#define GPIO_HANDLER_H

#include "esp_err.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "config.h"


/**
 * @brief Initialize GPIO pins and button handler
 * @param callback Function to call when button is pressed
 */
esp_err_t gpio_handler_init();

void beep_pattern(int count, int duration);

#endif // GPIO_HANDLER_H