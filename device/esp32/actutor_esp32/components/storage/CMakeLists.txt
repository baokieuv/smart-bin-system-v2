idf_component_register(
    SRCS "nvs_storage.c"
    INCLUDE_DIRS "."
    REQUIRES nvs_flash common
)