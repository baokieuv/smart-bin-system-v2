#include "uart_handler.h"
#include "config.h"
#include "servo.h"
#include "step_motor.h"
#include "esp_log.h"
#include "driver/uart.h"
#include "esp_ota_ops.h"
#include "mbedtls/md.h"
#include "nvs_storage.h"
#include "ultrasonic_sensor.h"

#include "esp_flash.h"
#include "esp_system.h"
#include "esp_chip_info.h"
#include <string.h>

static const char *TAG = "UART_HANDLER";

extern SmartBinConfig_t system_config;
extern SmartBinState_t bin_state;

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
    uart_send_frame_hmac(cmd, NULL, 0);
}

void uart_send_frame_hmac(uint8_t cmd, uint8_t *payload, uint16_t len) {
    uint8_t calculated_mac[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_type_t md_type = MBEDTLS_MD_SHA256;

    // A. TÍNH TOÁN HMAC
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

    // B. ĐÓNG GÓI FRAME VÀ GỬI ĐI
    uint16_t frame_size = 5 + len + 32 + 1; // Header(2) + Cmd(1) + Len(2) + Payload + HMAC(32) + Tail(1)
    uint8_t *frame = malloc(frame_size);
    if (frame == NULL) return; // Hết RAM

    uint16_t idx = 0;
    frame[idx++] = HEADER_1;
    frame[idx++] = HEADER_2;
    frame[idx++] = cmd;
    frame[idx++] = len_bytes[0];
    frame[idx++] = len_bytes[1];
    
    for(int i = 0; i < len; i++) frame[idx++] = payload[i];
    for(int i = 0; i < 32; i++) frame[idx++] = calculated_mac[i];

    frame[idx++] = TAIL;

    uart_write_bytes(UART_PORT_NUM, (const char *)frame, frame_size);
    free(frame);
}

static void handle_cmd_ctrl_servo(uint16_t len, uint8_t *payload) {
    if (bin_state == BIN_STATE_BLOCKED) {
        ESP_LOGW(TAG, "Tu choi dieu khien servo: Thung rac dang bi BLOCK");
        send_response(CMD_NACK);
        return;
    }
    
    if (len >= 1) {
        set_servo_angle(payload[0]);
        send_response(CMD_ACK);
    } else {
        send_response(CMD_NACK);
    }
}

static void handle_cmd_ctrl_stepper(uint16_t len, uint8_t *payload) {
    if (bin_state == BIN_STATE_BLOCKED) {
        ESP_LOGW(TAG, "Tu choi dieu khien stepper: Thung rac dang bi BLOCK");
        send_response(CMD_NACK);
        return;
    }

    if (len >= 2) {
        int16_t target_degree = (payload[0] << 8) | payload[1];
        xQueueSend(step_action_queue, &target_degree, 0);
        send_response(CMD_ACK);
    } else {
        send_response(CMD_NACK);
    }
}

static void handle_cmd_set_config(uint16_t len, uint8_t *payload) {
    if (len != 5) {
        ESP_LOGE(TAG, "Sai do dai Payload cua CMD_SET_CONFIG");
        send_response(CMD_NACK);
        return;
    }
    
    float new_depth;
    memcpy(&new_depth, &payload[0], sizeof(float)); 
    uint8_t new_threshold = payload[4];
    
    system_config.bin_depth_cm = new_depth;
    system_config.full_threshold_pct = new_threshold;
    
    if (nvs_save_bin_config(&system_config) == ESP_OK) {
        ESP_LOGI(TAG, "Cap nhat Config thanh cong: Sau=%.1fcm, Nguong=%d%%", 
                 system_config.bin_depth_cm, system_config.full_threshold_pct);
        send_response(CMD_ACK);
    } else {
        send_response(CMD_NACK);
    }
}

static void handle_cmd_get_version(void) {
    const esp_app_desc_t *app_desc = esp_app_get_description();
    uint16_t version_len = strlen(app_desc->version);
    ESP_LOGI(TAG, "Pi yeu cau check version. Hien tai: %s", app_desc->version);
    uart_send_frame_hmac(CMD_GET_VERSION, (uint8_t *)app_desc->version, version_len);
}

static void handle_cmd_ota_start(void) {
    ESP_LOGI(TAG, "Bat dau OTA...");
    update_partition = esp_ota_get_next_update_partition(NULL);
    if (esp_ota_begin(update_partition, OTA_WITH_SEQUENTIAL_WRITES, &update_handle) == ESP_OK) {
        send_response(CMD_ACK);
    } else {
        send_response(CMD_NACK);
    }
}

static void handle_cmd_ota_data(uint16_t len, uint8_t *payload) {
    if (esp_ota_write(update_handle, (const void *)payload, len) == ESP_OK) {
        send_response(CMD_ACK);
    } else {
        send_response(CMD_NACK);
    }
}

static void handle_cmd_ota_end(void) {
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

static void handle_cmd_report(void) {
    ESP_LOGI(TAG, "Start measure distance");
    TrashBinDistances_t dist = ultrasonic_read_all_bins();

    uint8_t fill_level[4] = {0};

    float depth = system_config.bin_depth_cm;

    if (dist.bin1_cm > 0) fill_level[0] = (uint8_t)(((depth - dist.bin1_cm) / depth) * 100);
    if (dist.bin2_cm > 0) fill_level[1] = (uint8_t)(((depth - dist.bin2_cm) / depth) * 100);
    if (dist.bin3_cm > 0) fill_level[2] = (uint8_t)(((depth - dist.bin3_cm) / depth) * 100);
    if (dist.bin4_cm > 0) fill_level[3] = (uint8_t)(((depth - dist.bin4_cm) / depth) * 100);

    for(int i = 0; i < 4; i++) {
        if (fill_level[i] > 100) fill_level[i] = 100;
    }

    uart_send_frame_hmac(CMD_REPORT_FILL_LEVEL, fill_level, 4);
}

static void handle_cmd_lid_open(void) {
    if (bin_state != BIN_STATE_BLOCKED) {
        set_servo_angle(SERVO_ANGLE_OPEN);
        bin_state = BIN_STATE_OPEN_HELD;
        send_response(CMD_ACK);
        ESP_LOGI(TAG, "Mo nap va giu (OPEN_HELD)");
    } else {
        ESP_LOGW(TAG, "Tu choi mo nap: Thung rac dang bi BLOCK");
        send_response(CMD_NACK);
    }
}

static void handle_cmd_lid_close(void) {
    if (bin_state != BIN_STATE_BLOCKED) {
        set_servo_angle(SERVO_ANGLE_CLOSE);
        bin_state = BIN_STATE_NORMAL;
        send_response(CMD_ACK);
        ESP_LOGI(TAG, "Dong nap (NORMAL)");
    } else {
        ESP_LOGW(TAG, "Tu choi dong nap (thu cong): Thung rac dang bi BLOCK");
        send_response(CMD_NACK);
    }
}

static void handle_cmd_lid_block(void) {
    // Luôn đóng nắp trước khi chuyển sang trạng thái Block
    set_servo_angle(SERVO_ANGLE_CLOSE);
    bin_state = BIN_STATE_BLOCKED;
    send_response(CMD_ACK);
    ESP_LOGI(TAG, "Khoa thung rac (BLOCKED)");
}

static void handle_cmd_lid_unblock(void) {
    bin_state = BIN_STATE_NORMAL;
    send_response(CMD_ACK);
    ESP_LOGI(TAG, "Mo khoa thung rac (NORMAL)");
}

static void handle_cmd_system_info(void) {
    ESP_LOGI(TAG, "Start Get system info");
    esp_chip_info_t chip_info;
    esp_chip_info(&chip_info);

    uint32_t flash_size = 0;
    if (esp_flash_get_size(NULL, &flash_size) != ESP_OK){
        ESP_LOGE(TAG, "Cannot read Flash!");
        flash_size = 0;
    }

    uint32_t internal_ram = heap_caps_get_total_size(MALLOC_CAP_INTERNAL);
    uint32_t psram_size = heap_caps_get_total_size(MALLOC_CAP_SPIRAM);
    uint32_t total_ram = internal_ram + psram_size;

    uint8_t response_payload[10];

    // Chip info
    response_payload[0] = (uint8_t)chip_info.model;
    response_payload[1] = (uint8_t)chip_info.cores;

    // Flash size 
    response_payload[2] = (flash_size >> 24) & 0xFF;
    response_payload[3] = (flash_size >> 16) & 0xFF;
    response_payload[4] = (flash_size >> 8)  & 0xFF;
    response_payload[5] = flash_size         & 0xFF;

    // RAM
    response_payload[6] = (total_ram >> 24) & 0xFF;
    response_payload[7] = (total_ram >> 16) & 0xFF;
    response_payload[8] = (total_ram >> 8)  & 0xFF;
    response_payload[9] = total_ram         & 0xFF;

    uart_send_frame_hmac(CMD_GET_SYSTEM_INFO, response_payload, sizeof(response_payload));
}

static void process_uart_command(uint8_t cmd, uint16_t len, uint8_t *payload) {
    ESP_LOGI(TAG, "HMAC OK! Lenh: 0x%02X", cmd);
    
    switch (cmd) {
        case CMD_CTRL_SERVO:   handle_cmd_ctrl_servo(len, payload); break;
        case CMD_CTRL_STEPPER: handle_cmd_ctrl_stepper(len, payload); break;
        case CMD_SET_CONFIG:   handle_cmd_set_config(len, payload); break;
        case CMD_GET_VERSION:  handle_cmd_get_version(); break;
        case CMD_OTA_START:    handle_cmd_ota_start(); break;
        case CMD_OTA_DATA:     handle_cmd_ota_data(len, payload); break;
        case CMD_OTA_END:      handle_cmd_ota_end(); break;
        case CMD_REPORT_FILL_LEVEL: handle_cmd_report(); break;
        case CMD_GET_SYSTEM_INFO:   handle_cmd_system_info(); break;
        case CMD_LID_OPEN:     handle_cmd_lid_open(); break;
        case CMD_LID_CLOSE:    handle_cmd_lid_close(); break;
        case CMD_LID_BLOCK:    handle_cmd_lid_block(); break;
        case CMD_LID_UNBLOCK:  handle_cmd_lid_unblock(); break;
        default:
            ESP_LOGW(TAG, "Lenh khong hop le: 0x%02X", cmd);
            send_response(CMD_NACK);
            break;
    }
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
                        state = WAIT_HMAC;
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
                            process_uart_command(current_cmd, current_len, payload_buf);
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