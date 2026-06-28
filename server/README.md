# Backend Microservices (Server)

Thư mục này chứa mã nguồn cho tất cả các dịch vụ backend của hệ thống "Smart Bin System V2". Hệ thống được xây dựng theo kiến trúc microservices sử dụng Java và Spring Boot.

## Kiến trúc

Hệ thống backend bao gồm nhiều microservice độc lập, mỗi service đảm nhiệm một chức năng nghiệp vụ cụ thể. Chúng giao tiếp với nhau một cách bất đồng bộ qua message broker (Kafka) và đồng bộ qua các API call (sử dụng Feign Client).

## Danh sách các Microservices

-   `/core`: Chứa các lớp, tiện ích và cấu hình chung được chia sẻ giữa các microservice khác. Module này được đóng gói và sử dụng như một thư viện phụ thuộc từ JitPack.
-   `/iam-service`: Quản lý định danh và phân quyền người dùng (Identity and Access Management). Tích hợp với Keycloak.
-   `/device-service`: Quản lý thông tin, trạng thái và hoạt động của các thiết bị thùng rác thông minh.
-   `/media-service`: Xử lý việc tải lên, lưu trữ và truy xuất các tệp media (hình ảnh, video).
-   `/noti-service`: Chịu trách nhiệm gửi thông báo (email, push notification) đến người dùng.
-   `/order-service`: Xử lý các giao dịch đổi điểm, mua hàng.
-   `/product-service`: Quản lý danh mục các sản phẩm có thể đổi thưởng.
-   `/reward-service`: Xử lý logic cộng điểm thưởng cho người dùng khi họ bỏ rác.

## Công nghệ sử dụng

-   **Ngôn ngữ:** Java 21
-   **Framework:** Spring Boot, Spring Cloud
-   **Giao tiếp:** Spring Kafka (bất đồng bộ), OpenFeign (đồng bộ)
-   **Cơ sở dữ liệu:** MariaDB (dữ liệu nghiệp vụ), Redis (caching)
-   **Bảo mật:** Spring Security, OAuth2 (tích hợp Keycloak)
-   **Build tool:** Apache Maven

## Yêu cầu

-   JDK 21 (hoặc phiên bản tương thích)
-   Apache Maven 3.9+

## Build và Chạy

### Build

Mỗi microservice là một dự án Maven độc lập. Để build một service, bạn cần di chuyển vào thư mục của service đó và chạy lệnh:

```bash
# Ví dụ build device-service
cd device-service
mvn clean install
```

Lệnh này sẽ tạo ra một file `.jar` thực thi được trong thư mục `target` của service đó.

**Lưu ý về module `core`:**
Các service khác phụ thuộc vào module `core` thông qua một dependency từ JitPack. Nếu bạn muốn chỉnh sửa code trong `core` và sử dụng phiên bản local, bạn cần:
1.  Build và cài đặt module `core` vào local repository:
    ```bash
    cd core
    mvn clean install
    ```
2.  Trong file `pom.xml` của service cần chỉnh sửa, comment dependency của JitPack và uncomment dependency trỏ đến `core` project local.

### Chạy Local

Sau khi build thành công, bạn có thể khởi chạy service bằng lệnh `java -jar`:

```bash
# Ví dụ chạy device-service
cd device-service
java -jar target/device-service-0.0.1-SNAPSHOT.jar
```

**Lưu ý quan trọng:** Các service yêu cầu các dịch vụ hạ tầng (Database, Kafka, Redis...) phải đang hoạt động. Cách dễ nhất để khởi chạy các dịch vụ này là sử dụng `docker-compose` trong thư mục `/docker`. Bạn cũng cần cung cấp các biến môi trường cần thiết (ví dụ: thông tin kết nối database) để service có thể khởi động.

### Chạy với Docker

Cách được khuyến khích để chạy toàn bộ hệ thống là thông qua Docker. Mỗi service đều có một `Dockerfile` để đóng gói thành image. Tham khảo `README.md` trong thư mục `/docker` để biết thêm chi tiết.
