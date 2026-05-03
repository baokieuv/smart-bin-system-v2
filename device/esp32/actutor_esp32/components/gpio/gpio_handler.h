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

/**
 * @brief Hàm beep cơ bản
 */
void beep_pattern(int count, int duration);

/**
 * @brief Hàm bật/tắt cảnh báo rác đầy
 * @param is_full true: Rác đầy, false: Rác đã được dọn
 */
void set_trash_full_alarm(bool is_full);

#endif // GPIO_HANDLER_H