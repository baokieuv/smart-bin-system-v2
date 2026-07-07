#ifndef UART_HANDLER_H
#define UART_HANDLER_H

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "esp_err.h"

extern QueueHandle_t step_action_queue;

void uart_handler_init(void);

void uart_send_frame_hmac(uint8_t cmd, uint8_t *payload, uint16_t len);

#endif