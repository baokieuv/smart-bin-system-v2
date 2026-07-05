# Frontend Web Applications

Thư mục này chứa mã nguồn cho các ứng dụng frontend của hệ thống "Smart Bin System V2". Tất cả các ứng dụng đều được xây dựng bằng Next.js, một framework phổ biến dựa trên React.

## Danh sách ứng dụng

Hệ thống bao gồm 3 giao diện web riêng biệt:

1.  **`/smart-bin-system-v2-fe`**: Giao diện chính cho người dùng cuối. Tại đây, người dùng có thể quản lý tài khoản, xem lịch sử giao dịch, tìm kiếm vị trí các thùng rác, v.v.
2.  **`/smart-bin-system-v2-shop`**: Giao diện cửa hàng đổi thưởng. Người dùng có thể sử dụng điểm tích lũy được từ việc bỏ rác để đổi lấy các sản phẩm, voucher.
3.  **`/smart-bin-system-v2-cms`**: Hệ thống Quản lý Nội dung (Content Management System) dành cho quản trị viên. Giao diện này cho phép quản lý người dùng, thiết bị, sản phẩm, và theo dõi hoạt động của toàn hệ thống.

## Công nghệ sử dụng

-   **Framework**: [Next.js](https://nextjs.org/)
-   **Thư viện UI**: [React](https://react.dev/)
-   **Ngôn ngữ**: [TypeScript](https://www.typescriptlang.org/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **Quản lý package**: [npm](https://www.npmjs.com/)

## Yêu cầu

-   [Node.js](https://nodejs.org/) (phiên bản 20.x trở lên)
-   [npm](https://www.npmjs.com/) (thường đi kèm với Node.js)

## Cài đặt và Chạy

Mỗi ứng dụng là một dự án Next.js độc lập. Các bước để chạy một ứng dụng ở môi trường development như sau:

1.  **Di chuyển vào thư mục của ứng dụng:**
    ```bash
    # Ví dụ với ứng dụng CMS
    cd smart-bin-system-v2-cms
    ```

2.  **Cài đặt dependencies:**
    ```bash
    npm install
    ```

3.  **Cấu hình môi trường:**
    Các ứng dụng cần kết nối đến backend API. Bạn cần tạo một file `.env.local` trong thư mục gốc của từng ứng dụng và định nghĩa các biến môi trường cần thiết.

    *Ví dụ file `.env.local`:*
    ```
    NEXT_PUBLIC_API_URL=http://localhost:8080/api
    # Các biến môi trường khác (Google Client ID, Mapbox Token, ...)
    ```

4.  **Khởi chạy development server:**
    ```bash
    npm run dev
    ```
    Ứng dụng sẽ chạy tại địa chỉ `http://localhost:3000` (hoặc một port khác nếu 3000 đã được sử dụng).

### Build cho Production

Để build ứng dụng cho môi trường production, sử dụng lệnh:
```bash
npm run build
```
Và để khởi chạy server production:
```bash
npm run start
```

### Chạy với Docker

Mỗi ứng dụng đều có một `Dockerfile` để đóng gói thành image. Tham khảo `README.md` trong thư mục `/docker` để biết thêm chi tiết về cách triển khai toàn bộ hệ thống.
