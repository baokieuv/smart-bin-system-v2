# Smart Bin System V2

Hệ thống thùng rác thông minh thế hệ thứ hai, một giải pháp toàn diện để quản lý và xử lý rác thải hiệu quả, kết hợp IoT, AI và các ứng dụng di động/web.

## Tổng quan

Dự án này xây dựng một hệ sinh thái hoàn chỉnh xung quanh một thùng rác thông minh, bao gồm:
- **Phân loại rác tại nguồn:** Sử dụng AI trên thiết bị nhúng để tự động nhận dạng và phân loại rác.
- **Tương tác người dùng:** Cung cấp ứng dụng di động và web để người dùng theo dõi, nhận thưởng và quản lý tài khoản.
- **Hệ thống quản lý:** Cung cấp trang web quản trị (CMS) để theo dõi hoạt động của các thùng rác và người dùng.
- **Kiến trúc Microservices:** Hệ thống backend được xây dựng trên kiến trúc microservices, đảm bảo khả năng mở rộng và bảo trì.

## Kiến trúc hệ thống

Hệ thống bao gồm các thành phần chính sau:

1.  **Device (Thiết bị):**
    *   Phần mềm chạy trên thiết bị phần cứng (ESP32 và máy tính nhúng) của thùng rác.
    *   Sử dụng model AI (`.tflite`) để nhận dạng rác và cử chỉ tay.
    *   Giao tiếp với backend qua MQTT hoặc HTTP.

2.  **Server (Máy chủ):**
    *   Hệ thống backend được xây dựng bằng Java (Spring Boot) theo kiến trúc microservices.
    *   Quản lý dữ liệu người dùng, thiết bị, giao dịch, sản phẩm, và thông báo.
    *   Các services giao tiếp với nhau qua Kafka.

3.  **Web (Ứng dụng Web):**
    *   `smart-bin-system-v2-fe`: Giao diện cho người dùng cuối.
    *   `smart-bin-system-v2-shop`: Giao diện cửa hàng đổi thưởng.
    *   `smart-bin-system-v2-cms`: Hệ thống quản lý nội dung (CMS) cho quản trị viên.
    *   Tất cả đều được xây dựng bằng Next.js (React).

4.  **Android (Ứng dụng di động):**
    *   Ứng dụng gốc cho nền tảng Android, cung cấp trải nghiệm người dùng mượt mà và tiện lợi.

5.  **Docker:**
    *   Cung cấp môi trường để triển khai toàn bộ hệ thống một cách dễ dàng với `docker-compose`.
    *   Bao gồm các dịch vụ hạ tầng như cơ sở dữ liệu (PostgreSQL, MariaDB), message broker (Kafka), object storage (Minio), và reverse proxy (Nginx).

## Công nghệ sử dụng

- **Backend:** Java, Spring Boot, Spring Cloud, Maven, Kafka, PostgreSQL, MariaDB, Redis.
- **Frontend (Web):** Next.js, React, TypeScript, Tailwind CSS.
- **Mobile (Android):** Kotlin, Jetpack Compose.
- **Device (IoT & AI):** Python, TensorFlow Lite, OpenCV, ESP-IDF.
- **Infrastructure:** Docker, Docker Compose, Nginx, Keycloak.

## Bắt đầu

Để triển khai và chạy thử toàn bộ hệ thống, vui lòng tham khảo file `README.md` sẽ được tạo trong thư mục `docker`.

## Chi tiết các thành phần

Để biết thêm thông tin chi tiết về từng thành phần, vui lòng truy cập các thư mục tương ứng (file README chi tiết sẽ được tạo sau):

-   `./android`
-   `./device`
-   `./server`
-   `./web`
-   `./docker`
