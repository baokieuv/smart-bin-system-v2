#ifndef CONFIG_H
#define CONFIG_H

#include "driver/gpio.h"
#include "driver/uart.h"

#if 0

// STEP MOTOR PIN
#define IN1         GPIO_NUM_15
#define IN2         GPIO_NUM_16
#define IN3         GPIO_NUM_17
#define IN4         GPIO_NUM_18

// SERVO PIN
#define SERVO_PIN   GPIO_NUM_4

// BUZZER + BUTTON + LED PIN
#define BUZZER_PIN      GPIO_NUM_14
#define BUTTON_PIN      GPIO_NUM_1
#define LED_PIN         GPIO_NUM_2

// ULTRASONIC SENSOR PINS
#define ULTRASONIC_TRIG_PIN    GPIO_NUM_5
#define ULTRASONIC_ECHO1_PIN   GPIO_NUM_6
#define ULTRASONIC_ECHO2_PIN   GPIO_NUM_7
#define ULTRASONIC_ECHO3_PIN   GPIO_NUM_8
#define ULTRASONIC_ECHO4_PIN   GPIO_NUM_9

// UART
#define UART_PORT_NUM      UART_NUM_0
#define UART_BAUD_RATE     115200
#define UART_TX_PIN        GPIO_NUM_10
#define UART_RX_PIN        GPIO_NUM_11
#define BUF_SIZE           2048

#endif

#if 1
// STEP MOTOR PIN
#define IN1         GPIO_NUM_25
#define IN2         GPIO_NUM_26
#define IN3         GPIO_NUM_27
#define IN4         GPIO_NUM_33

// SERVO PIN
#define SERVO_PIN   GPIO_NUM_32

// BUZZER + BUTTON + LED PIN
#define BUZZER_PIN      GPIO_NUM_4
#define BUTTON_PIN      GPIO_NUM_13
#define LED_PIN         GPIO_NUM_2

// ULTRASONIC SENSOR PINS
#define ULTRASONIC_TRIG_PIN    GPIO_NUM_19
#define ULTRASONIC_ECHO1_PIN   GPIO_NUM_34
#define ULTRASONIC_ECHO2_PIN   GPIO_NUM_35
#define ULTRASONIC_ECHO3_PIN   GPIO_NUM_18
#define ULTRASONIC_ECHO4_PIN   GPIO_NUM_19

// UART
#define UART_PORT_NUM      UART_NUM_0
#define UART_BAUD_RATE     115200
#define UART_TX_PIN        GPIO_NUM_17
#define UART_RX_PIN        GPIO_NUM_16
#define BUF_SIZE           2048
#endif

// Frame
#define HEADER_1           0xAA
#define HEADER_2           0x55
#define TAIL               0xEF

// Command
#define CMD_CTRL_SERVO         0x10
#define CMD_CTRL_STEPPER       0x11
#define CMD_OTA_START          0x20
#define CMD_OTA_DATA           0x21
#define CMD_OTA_END            0x22
#define CMD_ACK                0x30
#define CMD_NACK               0x31
#define CMD_REPORT_FILL_LEVEL  0x40
#define CMD_SET_CONFIG         0x50
#define CMD_GET_VERSION        0x60
#define CMD_GET_SYSTEM_INFO    0x70

#define CMD_LID_OPEN           0x80
#define CMD_LID_CLOSE          0x81
#define CMD_LID_BLOCK          0x82
#define CMD_LID_UNBLOCK        0x83

#define SERVO_ANGLE_CLOSE      0
#define SERVO_ANGLE_OPEN       90

// Ultrasonic constants
#define SOUND_SPEED             343
#define ECHO_TIMEOUT            300000

#define ULTRASONIC_MIN_DISTANCE     0
#define ULTRASONIC_MAX_DISTANCE     200

// Bin depth
// #define BIN_DEPTH_CM 60.0

// HMac Key
#define SECRET_KEY "HUST_SMART_BIN_KEY_2026"

// NVS
#define NVS_NAMESPACE       "storage"
#define NVS_KEY_CONFIG      "bin_config"
#define NVS_KEY_STATE       "bin_state"

// State
typedef enum {
    WAIT_HEADER_1,
    WAIT_HEADER_2,
    WAIT_CMD,
    WAIT_LEN_H,
    WAIT_LEN_L,
    WAIT_PAYLOAD,
    WAIT_CRC,
    WAIT_TAIL
} UartState_t;

//
typedef enum {
    SPEED_NORMAL,
    SPEED_DOUBLE,
} StepperSpeed_t;

typedef enum {
    ALARM_IDLE,       // Rác chưa đầy (Tắt hết)
    ALARM_BUZZING,    // Rác đầy -> Buzzer kêu
    ALARM_BLINKING    // Rác đầy + Đã bấm nút -> LED nháy
} AlarmState_t;

// Cấu trúc lưu trữ cấu hình hệ thống
typedef struct {
    float bin_depth_cm;         // Độ sâu thực tế của thùng rác (cm)
    uint8_t full_threshold_pct; // Ngưỡng báo đầy (cm - ví dụ: 2cm)
    char firm_version[16];      // Version of firmware
} SmartBinConfig_t;

typedef enum {
    BIN_STATE_NORMAL,       // Trạng thái bình thường
    BIN_STATE_OPEN_HELD,    // Trạng thái mở nắp và giữ
    BIN_STATE_BLOCKED       // Trạng thái khóa (không cho phép mở)
} SmartBinState_t;
#endif // CONFIG_H