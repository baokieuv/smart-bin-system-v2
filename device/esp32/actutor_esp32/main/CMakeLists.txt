idf_component_register(
    SRCS "main.c"
    INCLUDE_DIRS "."
    REQUIRES 
        # Thư viện hệ thống
        nvs_flash 
        driver 
        esp_event 
        esp_netif
        app_update
        
        # Các Component của bạn (Tên folder trong components/)
        gpio
        sensors
        common
)