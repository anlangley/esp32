# Kế hoạch triển khai: Xây dựng Backend Server & Bộ mô phỏng xe bằng phần mềm (Giai đoạn 2)

Kế hoạch này tập trung vào việc xây dựng hệ thống kết nối trung gian và mô phỏng mạng để bạn có thể kiểm thử toàn bộ chức năng điều khiển xe (Web $\rightarrow$ Server $\rightarrow$ Xe $\rightarrow$ Server $\rightarrow$ Web) ngay trên máy tính mà chưa cần lắp ráp hay cấu hình phần cứng ESP32 thật.

## User Review Required

> [!IMPORTANT]
> - Chúng tôi sẽ khởi tạo thư mục `backend/` song song với `frontend/`.
> - Máy chủ Backend sẽ được viết bằng **Node.js (sử dụng ES Modules sạch sẽ)** phối hợp với thư viện **Socket.io** để hỗ trợ WebSockets thời gian thực với độ trễ tối thiểu.
> - Chúng tôi sẽ tạo một file script mô phỏng `mock_device.js` đóng vai trò là chiếc xe ảo. Chiếc xe ảo này kết nối đến Server, in ra lệnh điều khiển động cơ nhận được từ web và tự động sinh ra các số liệu cảm biến (khoảng cách, pin, nhiệt độ) gửi ngược lại.
> - Cập nhật Frontend React kết nối tới cổng WebSocket Backend thay vì dùng mô phỏng nội bộ tự chạy.

## Open Questions

> [!NOTE]
> 1. Bạn có muốn cấu hình cổng mặc định cho Backend Server là `3000` không? (Giao diện Web sẽ chạy ở cổng `5173`, Server chạy ở cổng `3000`).
> 2. Bạn muốn chiếc xe ảo phản hồi tốc độ di chuyển như thế nào? (Chúng tôi dự kiến in trực tiếp xung điều khiển động cơ trái/phải ra màn hình terminal của Backend để bạn dễ quan sát).

---

## Proposed Changes

Chúng ta sẽ thực hiện các thay đổi và bổ sung sau:

### 1. Khởi tạo Backend Project

#### [NEW] [package.json](file:///d:/CNTT/duan_esp32/backend/package.json)
- Khai báo các dependencies chính: `express`, `socket.io`, `cors`.
- Khai báo cấu hình chạy `"type": "module"` để viết cú pháp import/export hiện đại.

#### [NEW] [server.js](file:///d:/CNTT/duan_esp32/backend/server.js)
- Khởi tạo Express app và máy chủ HTTP.
- Tích hợp Socket.io với cấu hình CORS cho phép giao diện Frontend truy cập.
- Xử lý các sự kiện chính:
  - Khách hàng (Web Client) kết nối và tham gia phòng điều khiển.
  - Xe (ESP32/Mock Device) kết nối và đăng ký định danh.
  - Nhận sự kiện `drive_command` từ Web và phát tiếp (emit) tới Xe.
  - Nhận sự kiện `telemetry_data` từ Xe và phát tiếp (emit) tới Web.
  - Quản lý trạng thái trực tuyến của xe và đồng bộ cho Frontend.

#### [NEW] [mock_device.js](file:///d:/CNTT/duan_esp32/backend/mock_device.js)
- Kết nối tới Backend Server thông qua `socket.io-client`.
- Nhận lệnh điều khiển động cơ từ Server, tính toán tốc độ động cơ Trái/Phải và in ra terminal dạng thanh biểu đồ ASCII trực quan để mô phỏng chuyển động.
- Gửi dữ liệu cảm biến (khoảng cách vật cản, điện áp pin, nhiệt độ) định kỳ lên Server.

### 2. Kết nối Frontend với Backend

#### [MODIFY] [package.json](file:///d:/CNTT/duan_esp32/frontend/package.json)
- Cài đặt thêm dependency `socket.io-client` để kết nối WebSocket từ giao diện React lên Server Node.js.

#### [MODIFY] [App.tsx](file:///d:/CNTT/duan_esp32/frontend/src/App.tsx)
- Thay thế bộ mô phỏng dữ liệu tự chạy (Simulator Loop) bằng việc kết nối WebSocket thực tế thông qua `socket.io-client`.
- Lắng nghe các sự kiện nhận dữ liệu telemetry từ xe thông qua Server để hiển thị.
- Gửi trực tiếp lệnh Joystick xuống Server thay vì lưu nội bộ.

---

## Verification Plan

### Automated Tests
- Chạy thử lệnh kiểm tra cú pháp và khởi chạy máy chủ backend: `node server.js`.
- Chạy thử bộ mô phỏng thiết bị: `node mock_device.js`.

### Manual Verification
1. Mở cùng lúc 3 terminal:
   - **Terminal 1 (Backend)**: Khởi chạy máy chủ Node.js.
   - **Terminal 2 (Mock Device)**: Khởi chạy xe ảo.
   - **Terminal 3 (Frontend)**: Chạy giao diện React.
2. Mở giao diện Web trên trình duyệt.
3. Kiểm tra xem trên Web có hiển thị trạng thái xe **Online** không.
4. Kéo Joystick hoặc nhấn W-A-S-D trên Web $\rightarrow$ quan sát xem Terminal của Xe ảo (Mock Device) có lập tức in ra tốc độ động cơ tương ứng không.
5. Kiểm tra xem số liệu cảm biến hiển thị trên Web có khớp với dữ liệu sinh ra từ xe ảo không.
