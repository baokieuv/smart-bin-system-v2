#ifndef CONFIG_H
#define CONFIG_H

#include "driver/gpio.h"
#include "driver/uart.h"

// STEP MOTOR PIN
#define IN1         GPIO_NUM_15
#define IN2         GPIO_NUM_16
#define IN3         GPIO_NUM_17
#define IN4         GPIO_NUM_18

// SERVO PIN
#define SERVO_PIN   GPIO_NUM_4

// BUZZER
#define BUZZER      GPIO_NUM_14

// UART
#define UART_PORT_NUM      UART_NUM_0
#define UART_BAUD_RATE     115200
#define UART_TX_PIN        GPIO_NUM_10
#define UART_RX_PIN        GPIO_NUM_11
#define BUF_SIZE           2048

// Frame
#define HEADER_1           0xAA
#define HEADER_2           0x55
#define TAIL               0xEF

// Command
#define CMD_CTRL_SERVO     0x10
#define CMD_CTRL_STEPPER   0x11
#define CMD_OTA_START      0x20
#define CMD_OTA_DATA       0x21
#define CMD_OTA_END        0x22
#define CMD_ACK            0x30
#define CMD_NACK           0x31

// HMac Key
#define SECRET_KEY "HUST_SMART_BIN_KEY_2026"

// State
typedef enum {
    WAIT_HEADER_1,
    WAIT_HEADER_2,
    WAIT_CMD,
    WAIT_LEN_H,
    WAIT_LEN_L,
    WAIT_PAYLOAD,
    WAIT_HMAC,
    WAIT_TAIL
} UartState_t;

//
typedef enum {
    SPEED_NORMAL,
    SPEED_DOUBLE,
} StepperSpeed_t;

#endif // CONFIG_H