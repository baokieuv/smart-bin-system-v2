# Smart Bin Android Application

Thư mục này chứa mã nguồn cho ứng dụng Android gốc của hệ thống "Smart Bin System V2". Ứng dụng này cung cấp cho người dùng một giao diện tiện lợi để tương tác với hệ sinh thái thùng rác thông minh.

## Công nghệ và Kiến trúc

Ứng dụng được xây dựng theo các tiêu chuẩn hiện đại của Android:

-   **Ngôn ngữ:** [Kotlin](https://kotlinlang.org/)
-   **Kiến trúc UI:** [Jetpack Compose](https://developer.android.com/jetpack/compose) - bộ công cụ mới nhất của Google để xây dựng giao diện người dùng gốc.
-   **Build tool:** [Gradle](https://gradle.org/)
-   **Kiến trúc ứng dụng:** (Dự kiến) MVVM (Model-View-ViewModel) hoặc MVI (Model-View-Intent), kết hợp với các thành phần Jetpack khác như ViewModel, LiveData/Flow.

## Tính năng (Dự kiến)

-   **Xác thực người dùng:** Đăng nhập, đăng ký tài khoản (tích hợp với Keycloak của hệ thống).
-   **Bản đồ thông minh:** Hiển thị vị trí các thùng rác trên bản đồ, giúp người dùng dễ dàng tìm kiếm.
-   **Tương tác với thùng rác:** Quét mã QR để định danh người dùng tại thùng rác trước khi bỏ rác.
-   **Quản lý điểm thưởng:** Theo dõi lịch sử tích điểm, xem tổng số điểm hiện có.
-   **Cửa hàng đổi thưởng:** Xem và đổi các sản phẩm, voucher từ điểm tích lũy.
-   **Thông báo:** Nhận các thông báo từ hệ thống.

## Yêu cầu

-   [Android Studio](https://developer.android.com/studio) (phiên bản mới nhất được khuyến khích)
-   JDK 11 hoặc mới hơn (thường được tích hợp sẵn trong Android Studio)

## Cài đặt và Chạy

1.  **Mở dự án:**
    -   Mở Android Studio.
    -   Chọn "Open an existing project".
    -   Trỏ đến thư mục `android` của dự án này và chọn "OK".

2.  **Đồng bộ Gradle:**
    -   Android Studio sẽ tự động quét và đồng bộ các dependency được định nghĩa trong file `build.gradle.kts` và `gradle/libs.versions.toml`. Quá trình này có thể mất vài phút ở lần đầu tiên.

3.  **Cấu hình API Keys (Nếu có):**
    -   Các tính năng như bản đồ (Google Maps) hoặc đăng nhập (Google Sign-In) thường yêu cầu API key.
    -   Bạn có thể cần phải tạo một file `local.properties` trong thư mục gốc `android` và thêm các key vào đó, ví dụ:
        ```properties
        MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
        ```
    -   *Lưu ý: Kiểm tra mã nguồn để biết chính xác tên biến và nơi cần cấu hình.*

4.  **Chạy ứng dụng:**
    -   Kết nối một thiết bị Android thật hoặc khởi động một máy ảo (Emulator) từ AVD Manager của Android Studio.
    -   Nhấn nút "Run 'app'" (biểu tượng tam giác màu xanh) trên thanh công cụ.

5.  **Build APK:**
    -   Để tạo file APK để cài đặt, chọn `Build > Build Bundle(s) / APK(s) > Build APK(s)` từ menu. File APK sẽ được tạo trong thư mục `android/app/build/outputs/apk/debug`.
