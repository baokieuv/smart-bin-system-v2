#include "uart_handler.h"
#include "config.h"
#include "servo.h"
#include "step_motor.h"
#include "esp_log.h"
#include "driver/uart.h"
#include "esp_ota_ops.h"
#include "mbedtls/md.h"
#include <string.h>

static const char *TAG = "UART_HANDLER";

esp_ota_handle_t update_handle = 0 ;
const esp_partition_t *update_partition = NULL;

QueueHandle_t step_action_queue;

// Xác thực chữ ký HMAC
bool verify_hmac(uint8_t cmd, uint16_t len, uint8_t *payload, uint8_t *received_hmac){
    uint8_t calculated_mac[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_type_t md_type = MBEDTLS_MD_SHA256;

    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(md_type), 1);
    mbedtls_md_hmac_starts(&ctx, (const unsigned char *)SECRET_KEY, strlen(SECRET_KEY));

    mbedtls_md_hmac_update(&ctx, &cmd, 1);
    uint8_t len_bytes[2] = {(len >> 8) & 0xFF, len & 0xFF};
    mbedtls_md_hmac_update(&ctx, len_bytes, 2);
    if (len > 0) {
        mbedtls_md_hmac_update(&ctx, payload, len);
    }
    mbedtls_md_hmac_finish(&ctx, calculated_mac);
    mbedtls_md_free(&ctx);

    return (memcmp(calculated_mac, received_hmac, 32) == 0);
}

void send_response(uint8_t cmd) {
    uint8_t resp[7] = {HEADER_1, HEADER_2, cmd, 0x00, 0x00, cmd, TAIL};
    uart_write_bytes(UART_PORT_NUM, (const char *)resp, sizeof(resp));
}

void uart_rx_task(void *arg) {
    uint8_t data[BUF_SIZE];
    UartState_t state = WAIT_HEADER_1;
    
    uint8_t current_cmd = 0;
    uint16_t current_len = 0;
    uint8_t payload_buf[1024]; 
    uint16_t payload_index = 0;

    uint8_t received_hmac[32];
    uint8_t hmac_index = 0;

    while (1) {
        int len = uart_read_bytes(UART_PORT_NUM, data, BUF_SIZE, 20 / portTICK_PERIOD_MS);
        
        for (int i = 0; i < len; i++) {
            uint8_t b = data[i];

            switch (state) {
                case WAIT_HEADER_1:
                    if (b == HEADER_1) state = WAIT_HEADER_2;
                    break;
                case WAIT_HEADER_2:
                    if (b == HEADER_2) state = WAIT_CMD;
                    else state = WAIT_HEADER_1;
                    break;
                case WAIT_CMD:
                    current_cmd = b;
                    state = WAIT_LEN_H;
                    break;
                case WAIT_LEN_H:
                    current_len = (b << 8);
                    state = WAIT_LEN_L;
                    break;
                case WAIT_LEN_L:
                    current_len |= b;
                    payload_index = 0;
                    if (current_len > 0 && current_len <= sizeof(payload_buf)) {
                        state = WAIT_PAYLOAD;
                    } else if (current_len == 0) {
                        state = WAIT_HMAC; // FIX LỖI Ở ĐÂY: Nhảy thẳng qua chờ HMAC nếu payload rỗng
                        hmac_index = 0;
                    } else {
                        state = WAIT_HEADER_1;
                    }
                    break;
                case WAIT_PAYLOAD:
                    payload_buf[payload_index++] = b;
                    if (payload_index == current_len) {
                        state = WAIT_HMAC;
                        hmac_index = 0;
                    }
                    break;
                case WAIT_HMAC:
                    received_hmac[hmac_index++] = b;
                    if (hmac_index == 32) {
                        state = WAIT_TAIL;
                    }
                    break;
                case WAIT_TAIL:
                    if (b == TAIL) {
                        if (verify_hmac(current_cmd, current_len, payload_buf, received_hmac)) {
                            ESP_LOGI(TAG, "HMAC OK! Lenh: 0x%02X", current_cmd);
                            
                            if (current_cmd == CMD_CTRL_SERVO) {
                                set_servo_angle(payload_buf[0]);
                                send_response(CMD_ACK);
                            }
                            else if (current_cmd == CMD_CTRL_STEPPER) {
                                if (current_len >= 2) {
                                    int16_t target_degree = (payload_buf[0] << 8) | payload_buf[1];
                                    xQueueSend(step_action_queue, &target_degree, 0);
                                    send_response(CMD_ACK);
                                } else send_response(CMD_NACK);
                            }
                            else if (current_cmd == CMD_OTA_START) {
                                ESP_LOGI(TAG, "Bat dau OTA...");
                                update_partition = esp_ota_get_next_update_partition(NULL);
                                if (esp_ota_begin(update_partition, OTA_WITH_SEQUENTIAL_WRITES, &update_handle) == ESP_OK)
                                    send_response(CMD_ACK);
                                else send_response(CMD_NACK);
                            }
                            else if (current_cmd == CMD_OTA_DATA) {
                                if (esp_ota_write(update_handle, (const void *)payload_buf, current_len) == ESP_OK)
                                    send_response(CMD_ACK);
                                else send_response(CMD_NACK);
                            }
                            else if (current_cmd == CMD_OTA_END) {
                                ESP_LOGI(TAG, "Ket thuc OTA, khoi dong lai...");
                                if (esp_ota_end(update_handle) == ESP_OK) {
                                    if (esp_ota_set_boot_partition(update_partition) == ESP_OK) {
                                        send_response(CMD_ACK);
                                        vTaskDelay(pdMS_TO_TICKS(1000));
                                        esp_restart(); 
                                    }
                                }
                                send_response(CMD_NACK);
                            }
                        } else {
                            ESP_LOGE(TAG, "Loi HMAC! Tu choi lenh.");
                            send_response(CMD_NACK);
                        }
                    }
                    state = WAIT_HEADER_1;
                    break;
                default:
                    state = WAIT_HEADER_1;
                    break;
            }
        }
    }
}

void uart_handler_init(void) {
    uart_config_t uart_config = {
        .baud_rate = UART_BAUD_RATE,
        .data_bits = UART_DATA_8_BITS,
        .parity    = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_APB,
    };
    uart_param_config(UART_PORT_NUM, &uart_config);
    uart_set_pin(UART_PORT_NUM, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    uart_driver_install(UART_PORT_NUM, BUF_SIZE * 2, 0, 0, NULL, 0);

    step_action_queue = xQueueCreate(5, sizeof(int16_t));

    xTaskCreate(uart_rx_task, "uart_rx_task", 8192, NULL, 10, NULL);
    ESP_LOGI(TAG, "UART Handler Initialized");
}