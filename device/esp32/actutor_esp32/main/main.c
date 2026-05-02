#include <stdio.h>
#include "esp_log.h"

#include "servo.h"
#include "step_motor.h"
#include "gpio_handler.h"
#include "config.h"

#include "esp_err.h"
#include "esp_event.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_ota_ops.h"

static const char *TAG = "MAIN";

esp_ota_handle_t update_handle = 0 ;
const esp_partition_t *update_partition = NULL;

QueueHandle_t step_action_queue;

// Hàm tính Checksum (XOR từ Command đến hết Payload)
uint8_t calculate_checksum(uint8_t cmd, uint16_t len, uint8_t *payload) {
    uint8_t checksum = cmd ^ (len >> 8) ^ (len & 0xFF);
    for (int i = 0; i < len; i++) {
        checksum ^= payload[i];
    }
    return checksum;
}

// Hàm gửi phản hồi về Pi
void send_response(uint8_t cmd) {
    uint8_t resp[7] = {HEADER_1, HEADER_2, cmd, 0x00, 0x00, cmd, TAIL};
    uart_write_bytes(UART_PORT_NUM, (const char *)resp, sizeof(resp));
}

// Khởi tạo UART
void init_uart(void) {
    uart_config_t uart_config = {
        .baud_rate = UART_BAUD_RATE,
        .data_bits = UART_DATA_8_BITS,
        .parity    = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_APB,
    };
    uart_driver_install(UART_PORT_NUM, BUF_SIZE * 2, 0, 0, NULL, 0);
    uart_param_config(UART_PORT_NUM, &uart_config);
    uart_set_pin(UART_PORT_NUM, UART_TX_PIN, UART_RX_PIN, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
}

// Task xử lý UART
void uart_rx_task(void *arg) {
    uint8_t data[BUF_SIZE];
    UartState_t state = WAIT_HEADER_1;
    
    uint8_t current_cmd = 0;
    uint16_t current_len = 0;
    uint8_t payload_buf[1024]; // Buffer chứa payload tối đa 1024 bytes
    uint16_t payload_index = 0;
    uint8_t received_checksum = 0;

    while (1) {
        // Đọc dữ liệu từ UART (chờ tối đa 20ms)
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
                        state = WAIT_CHECKSUM;
                    } else {
                        // Kích thước không hợp lệ, reset
                        state = WAIT_HEADER_1;
                    }
                    break;
                case WAIT_PAYLOAD:
                    payload_buf[payload_index++] = b;
                    if (payload_index == current_len) {
                        state = WAIT_CHECKSUM;
                    }
                    break;
                case WAIT_CHECKSUM:
                    received_checksum = b;
                    state = WAIT_TAIL;
                    break;
                case WAIT_TAIL:
                    if (b == TAIL) {
                        // Két thúc frame, kiểm tra checksum
                        uint8_t calc_cs = calculate_checksum(current_cmd, current_len, payload_buf);
                        if (calc_cs == received_checksum) {
                            // CHECKSUM ĐÚNG -> XỬ LÝ LỆNH
                            ESP_LOGI(TAG, "Nhan lenh: 0x%02X, Dai: %d", current_cmd, current_len);
                            
                            if (current_cmd == CMD_CTRL_SERVO) {
                                ESP_LOGI(TAG, "Dieu khien Servo goc: %d", payload_buf[0]);
                                set_servo_angle(payload_buf[0]);
                                send_response(CMD_ACK);
                            }
                            else if (current_cmd == CMD_CTRL_STEPPER) {
                                // Payload chứa góc (dùng int16 để chứa số âm, truyền bằng 2 byte)
                                if (current_len >= 2) {
                                    int16_t target_degree = (payload_buf[0] << 8) | payload_buf[1];
                                    ESP_LOGI(TAG, "Nhan lenh xoay Step Motor goc: %d", target_degree);
                                    
                                    // Đẩy góc cần xoay vào Queue cho main task xử lý
                                    xQueueSend(step_action_queue, &target_degree, 0);
                                    send_response(CMD_ACK);
                                } else {
                                    send_response(CMD_NACK);
                                }
                            }
                            else if (current_cmd == CMD_OTA_START) {
                                ESP_LOGI(TAG, "Bat dau OTA...");
                                update_partition = esp_ota_get_next_update_partition(NULL);
                                esp_err_t err = esp_ota_begin(update_partition, OTA_WITH_SEQUENTIAL_WRITES, &update_handle);
                                if (err == ESP_OK) send_response(CMD_ACK);
                                else send_response(CMD_NACK);
                            }
                            else if (current_cmd == CMD_OTA_DATA) {
                                esp_err_t err = esp_ota_write(update_handle, (const void *)payload_buf, current_len);
                                if (err == ESP_OK) send_response(CMD_ACK);
                                else send_response(CMD_NACK);
                            }
                            else if (current_cmd == CMD_OTA_END) {
                                ESP_LOGI(TAG, "Ket thuc OTA, dang khoi dong lai...");
                                if (esp_ota_end(update_handle) == ESP_OK) {
                                    esp_err_t err = esp_ota_set_boot_partition(update_partition);
                                    if (err == ESP_OK) {
                                        send_response(CMD_ACK);
                                        vTaskDelay(1000 / portTICK_PERIOD_MS);
                                        esp_restart(); // Reset de chay code moi
                                    }
                                }
                                send_response(CMD_NACK);
                            }
                        } else {
                            ESP_LOGE(TAG, "Loi Checksum! Tinh: 0x%02X, Nhan: 0x%02X", calc_cs, received_checksum);
                            send_response(CMD_NACK);
                        }
                    }
                    // Bất kể đúng sai tail, kết thúc frame đều quay về chờ header mới
                    state = WAIT_HEADER_1;
                    break;
            }
        }
    }
}

void app_main(void)
{
    ESP_LOGI(TAG, "Khoi tao he thong...");

    step_action_queue = xQueueCreate(5, sizeof(int16_t));
    
    gpio_handler_init();
    init_stepper();
    init_servo();
    init_uart();

    set_servo_angle(0);
    beep_pattern(2, 100);

    xTaskCreate(uart_rx_task, "uart_rx_task", 8192, NULL, 10, NULL);

    int16_t current_degree_request;

    while (1) {
        if (xQueueReceive(step_action_queue, &current_degree_request, portMAX_DELAY) == pdPASS) {
            ESP_LOGI(TAG, "[ACT] 1. Step motor bat dau xoay: %d do", current_degree_request);
            step_motor_by_degree(current_degree_request);
            
            // Xoay xong step, kích hoạt Servo
            ESP_LOGI(TAG, "[ACT] 2. Servo mo 60 do");
            set_servo_angle(60);

            // Chờ 1.5 giây
            ESP_LOGI(TAG, "[ACT] 3. Dang cho 1.5s...");
            vTaskDelay(pdMS_TO_TICKS(1500));
            
            // Đóng Servo về vị trí 0
            ESP_LOGI(TAG, "[ACT] 4. Servo dong ve 0 do");
            set_servo_angle(0);

            // Chờ servo chạy xong (khoảng 300ms tùy servo)
            vTaskDelay(pdMS_TO_TICKS(300));
            
            // Step motor xoay về vị trí cũ (xoay ngược lại góc đã nhận)
            ESP_LOGI(TAG, "[ACT] 5. Step motor xoay ve vi tri cu");
            step_motor_by_degree(-current_degree_request);
            
            ESP_LOGI(TAG, "[ACT] Chu trinh hoan tat. Cho lenh moi.");
        }
    }
}
