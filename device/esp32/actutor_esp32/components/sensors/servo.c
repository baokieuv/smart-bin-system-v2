#include "servo.h"
#include "driver/ledc.h"

// Thông số cho Servo SG90
#define SERVO_MIN_PULSEWIDTH 500  // Tương ứng 0 độ (us)
#define SERVO_MAX_PULSEWIDTH 2400 // Tương ứng 180 độ (us)
#define SERVO_MAX_DEGREE     180
#define LEDC_TIMER           LEDC_TIMER_0
#define LEDC_MODE            LEDC_LOW_SPEED_MODE
#define LEDC_CHANNEL         LEDC_CHANNEL_0
#define LEDC_DUTY_RES        LEDC_TIMER_13_BIT // 13 bit
#define LEDC_FREQUENCY       50 // 50Hz cho servo

void init_servo() {
    ledc_timer_config_t ledc_timer = {
        .speed_mode       = LEDC_MODE,
        .timer_num        = LEDC_TIMER,
        .duty_resolution  = LEDC_DUTY_RES,
        .freq_hz          = LEDC_FREQUENCY,
        .clk_cfg          = LEDC_AUTO_CLK
    };
    ledc_timer_config(&ledc_timer);

    ledc_channel_config_t ledc_channel = {
        .speed_mode     = LEDC_MODE,
        .channel        = LEDC_CHANNEL,
        .timer_sel      = LEDC_TIMER,
        .intr_type      = LEDC_INTR_DISABLE,
        .gpio_num       = SERVO_PIN,
        .duty           = 0,
        .hpoint         = 0
    };
    ledc_channel_config(&ledc_channel);
}

void set_servo_angle(int angle) {
    angle += 6;
    
    if (angle < 0) angle = 0;
    if (angle > SERVO_MAX_DEGREE) angle = SERVO_MAX_DEGREE;

    // Tính pulsewidth
    uint32_t pulsewidth = SERVO_MIN_PULSEWIDTH + ((SERVO_MAX_PULSEWIDTH - SERVO_MIN_PULSEWIDTH) * angle) / SERVO_MAX_DEGREE;
    
    // Tính duty cycle (2^13 = 8192)
    uint32_t duty = (pulsewidth * 8192) / 20000; // 50Hz = 20ms = 20000us

    ledc_set_duty(LEDC_MODE, LEDC_CHANNEL, duty);
    ledc_update_duty(LEDC_MODE, LEDC_CHANNEL);
}