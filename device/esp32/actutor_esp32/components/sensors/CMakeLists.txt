idf_component_register(
    SRCS "uart_handler.c" "servo.c" "step_motor.c" # Liệt kê cả 2 file sensor
    INCLUDE_DIRS "."
    REQUIRES driver esp_timer common app_update mbedtls 
)