idf_component_register(
    SRCS "gpio_handler.c"
    INCLUDE_DIRS "."
    REQUIRES driver esp_timer common
)