# Smart Bin Device Software

Thư mục này chứa toàn bộ phần mềm chạy trên thiết bị thùng rác thông minh (on-device/edge). Đây là "bộ não" của thùng rác, chịu trách nhiệm từ việc điều khiển phần cứng, nhận dạng AI, cho đến giao tiếp với server.

## Kiến trúc trên thiết bị

Phần mềm trên thiết bị được chia làm 2 phần chính, hoạt động trên 2 thành phần phần cứng khác nhau:

1.  **Máy tính nhúng (ví dụ: Raspberry Pi):**
    -   Chạy ứng dụng chính `smart_bin_desktop`.
    -   Đây là trung tâm điều phối, xử lý logic, chạy các mô hình AI và giao tiếp với thế giới bên ngoài.
2.  **Vi điều khiển (ESP32):**
    -   Chạy firmware chuyên dụng cho việc điều khiển phần cứng cấp thấp.
    -   Giao tiếp với máy tính nhúng qua cổng serial (UART).

## Danh sách thành phần

-   `/smart_bin_desktop`: Ứng dụng chính của thiết bị, được viết bằng Python.
    -   **Giao diện:** Sử dụng `PyQt6` để hiển thị giao diện (có thể trên một màn hình cảm ứng gắn trên thùng rác).
    -   **Xử lý AI:** Tận dụng thư viện `ultralytics` (YOLO) và `tensorflow` để thực thi các mô hình nhận dạng vật thể (rác, tay người).
    -   **Giao tiếp phần cứng:** Dùng `pyserial` để gửi lệnh và nhận dữ liệu từ ESP32 (ví dụ: lệnh mở nắp, đọc trạng thái cảm biến).
    -   **Giao tiếp server:** Dùng `paho-mqtt` để kết nối với MQTT broker (ThingsBoard) và `requests` cho các API call khác.

-   `/esp32`: Chứa firmware cho vi điều khiển ESP32.
    -   `actutor_esp32.bin`: File firmware đã được biên dịch, sẵn sàng để nạp vào ESP32.
    -   Chịu trách nhiệm trực tiếp điều khiển các cơ cấu chấp hành (động cơ servo, đèn LED) và đọc tín hiệu từ các cảm biến.

-   `/trash_detection.py`, `/trash_classification`, `/hand_detection`: Các script và tài nguyên liên quan đến việc huấn luyện, tinh chỉnh và export các mô hình AI.
    -   `export_model.py`: Script để chuyển đổi mô hình đã huấn luyện sang định dạng phù hợp cho thiết bị (ví dụ: `.tflite`).

## Luồng hoạt động (dự kiến)

1.  Người dùng đưa tay lại gần, ứng dụng `smart_bin_desktop` sử dụng camera và model `hand_detection` để phát hiện.
2.  `smart_bin_desktop` gửi lệnh "mở nắp" qua serial tới `ESP32`.
3.  `ESP32` nhận lệnh và điều khiển động cơ mở nắp thùng rác.
4.  Người dùng bỏ rác vào.
5.  `smart_bin_desktop` dùng camera và model `trash_classification` để xác định loại rác.
6.  Thông tin về loại rác và người dùng được gửi lên server qua MQTT.
7.  `smart_bin_desktop` gửi lệnh "phân loại" qua serial tới `ESP32` (nếu có cơ chế phân loại vật lý).
8.  `ESP32` điều khiển các cơ cấu chấp hành để đưa rác vào đúng ngăn.

## Yêu cầu

-   Python 3.10+
-   Các thư viện Python được liệt kê trong `smart_bin_desktop/requirements.txt`.
-   (Cho ESP32) Môi trường lập trình ESP-IDF (nếu muốn tự biên dịch firmware).

## Cài đặt và Chạy

### Ứng dụng Desktop (Bộ não chính)

1.  **Di chuyển vào thư mục:**
    ```bash
    cd device/smart_bin_desktop
    ```
2.  **Tạo và kích hoạt môi trường ảo (khuyến khích):**
    ```bash
    python -m venv venv
    # Windows
    .\venv\Scripts\activate
    # macOS/Linux
    source venv/bin/activate
    ```
3.  **Cài đặt dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
4.  **Chạy ứng dụng:**
    ```bash
    python main.py
    ```

### Firmware cho ESP32

-   Sử dụng một công cụ nạp firmware (ví dụ: `esptool.py`) để nạp file `device/esp32/actutor_esp32.bin` vào vi điều khiển ESP32 của bạn.
-   File `test_ota.py` dùng để thử nghiệm tính năng cập nhật firmware qua mạng (Over-the-Air).
