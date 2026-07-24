# Kế hoạch triển khai tổng thể dự án Xe điều khiển IoT

Tài liệu này tổng hợp toàn bộ kế hoạch triển khai chi tiết qua các giai đoạn của dự án thiết lập hệ thống xe ô tô điều khiển IoT.

---

## GIAI ĐOẠN 1: Thiết kế Giao diện React & Kết nối Camera (ĐÃ HOÀN THÀNH)

Giai đoạn này tập trung xây dựng giao diện vận hành (Dashboard Cockpit) và liên kết nguồn cấp camera thời gian thực để người dùng có thể quan sát trực quan.

### Các thành phần đã phát triển
* **React SPA (Vite + TypeScript):** Khởi tạo ứng dụng frontend với cấu hình TypeScript nghiêm ngặt (`verbatimModuleSyntax`).
* **Dashboard Cockpit (Giao diện điều khiển):** Thiết kế theo phong cách Glassmorphism hiện đại, hỗ trợ Dark Mode, hiển thị các thông số đo của xe:
  * Đồng hồ báo pin chuyên nghiệp (% pin, điện áp).
  * Thanh tiến trình đo khoảng cách cảm biến siêu âm (có cảnh báo đỏ dưới 15cm).
  * Biểu đồ độ mạnh sóng WiFi (RSSI) và đo nhiệt độ bo mạch của xe.
  * Cửa sổ Nhật ký hệ thống (System Log) ghi lại các sự kiện kết nối thời gian thực.
* **Bộ điều khiển ảo (Virtual Joystick & Keyboard):** 
  * Tích hợp bộ Joystick ảo kéo thả mượt mà trên trình duyệt.
  * Lắng nghe sự kiện bàn phím (W-A-S-D hoặc các phím mũi tên) để lái xe trên máy tính.
* **MJPEG Live Feed Camera Component:** Khung phát video hiển thị luồng MJPEG trực tiếp từ camera điện thoại Android (qua ứng dụng IP Webcam) với lưới ngắm tiêu điểm đẹp mắt.

---

## GIAI ĐOẠN 2: Máy chủ trung gian Node.js & Xe ảo mô phỏng (ĐÃ HOÀN THÀNH)

Giai đoạn này xây dựng hạ tầng mạng truyền nhận trung gian và viết script xe giả lập để kiểm thử toàn bộ vòng lặp điều khiển khép kín trên máy tính.

### Các thành phần đã phát triển
* **Backend WebSocket Broker (`backend/server.js`):**
  * Viết bằng Node.js & Socket.io trên cổng `3000`.
  * Quản lý phân loại Client (Web người dùng) và Device (Xe điện).
  * Trung chuyển tức thời lệnh điều khiển `drive_command` từ Web xuống xe và chuyển tiếp dữ liệu cảm biến `telemetry_data` ngược lại.
* **Xe ảo mô phỏng phần cứng (`backend/mock_device.js`):**
  * Kết nối WebSocket như một thiết bị thật.
  * Nhận tọa độ lái vi sai, quy đổi sang xung PWM cho động cơ Trái/Phải và in ra terminal dạng đồ họa ASCII trực quan.
  * Giả lập vật lý: tự sụt áp pin, tự tăng nhiệt độ động cơ và giảm khoảng cách siêu âm khi tiến về phía trước.
  * Giả lập hệ thống phanh tự động khẩn cấp (Emergency Auto-brake) khi khoảng cách gần vật cản dưới 15cm.
* **Kết nối Frontend WebSocket:** Cập nhật file `App.tsx` kết nối trực tiếp đến Socket Server để đồng bộ hóa hoạt động.

---

## GIAI ĐOẠN 3: Firmware C++ S.BUS cho ESP32 & Đấu nối mạch thật (ĐANG TRIỂN KHAI)

Giai đoạn này chuyển giao toàn bộ logic điều khiển từ xe ảo sang phần cứng thật sử dụng board ESP32 và bộ thu phát tay MC6C.

### Sơ đồ cấu hình phần cứng
* **Bộ điều khiển 4 Động cơ:** Ghép song song động cơ trái trước/sau thành cụm Trái, phải trước/sau thành cụm Phải để lái vi sai bằng mạch cầu H L298N.
* **Tay điều khiển MC6C:** Sử dụng cổng ra S.BUS của bộ thu kết nối vào chân **GPIO 16 (RX2)** của ESP32 thông qua giao thức Serial ngược cực (Inverted UART 100000 baud) bằng phần mềm của ESP32.
* **Hạ áp bảo vệ nguồn:** Dùng Pin 2S (7.4V - 8.4V) cấp nguồn lực cho L298N, đồng thời qua mạch hạ áp **LM2596** đưa về điện áp **5V ổn định** nuôi ESP32 và đầu thu Rx để chống sụt áp đột ngột (Brownout Reset).
* **Quản lý Tính năng (Feature Flags):** Hỗ trợ công tắc tắt mở phần mềm cho cảm biến siêu âm (`ENABLE_ULTRASONIC`) và đo pin (`ENABLE_BATTERY_MONITOR`) để xe có thể hoạt động ngay cả khi chưa mua đủ cảm biến.
* **Tự động nhận diện IP Máy chủ (mDNS):** ESP32 kết nối WiFi nội bộ và tự tìm kiếm máy chủ Node.js thông qua tên máy tính của bạn: `LAPTOP-8EPKMA78.local` thay vì ghi cứng IP tĩnh dễ bị thay đổi.
