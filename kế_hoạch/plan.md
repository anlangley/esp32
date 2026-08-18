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

### Sơ đồ cấu hình phần cứng & Bố trí tầng xe (Khung xe 2 Tầng)

![Sơ đồ 3D cấu trúc 2 tầng xe IoT tích hợp Samsung S10 5G](file:///C:/Users/LOQ/.gemini/antigravity-ide/brain/8a2e3f55-17cd-4b48-aeca-093297a1b0b9/car_2tier_s10_layout_diagram_1785086085429.png)

* **Bố trí không gian xe (2 Tầng):**
  * **Tầng 1 (Tầng dưới - Động cơ & Nguồn công suất):**
    * 4 Động cơ DC giảm tốc vàng (gắn dưới sàn).
    * Mạch cầu H L298N + Mạch hạ áp LM2596 (đặt ở phía sau).
    * Cảm biến siêu âm HC-SR04 (gắn ở đầu phía trước).
  * **Tầng 2 (Tầng trên - Điều khiển & Pin):**
    * **Pin Tattu LiPo 2S 450mAh 75C (7.4V - 8.4V):** Đặt ở phía sau tầng 2, thắt bằng dây nhám dính Velcro (siêu nhẹ ~28g, dòng xả cực cao 75C giúp xe chạy cực bốc).
    * **ESP32 DevKit V1 + Đế mở rộng Terminal 30P:** Đặt ở trung tâm tầng 2 (dễ cắm cáp nạp USB & đi dây G-V-S).
    * **Bộ thu RC MC6C:** Đặt cạnh đế ESP32.
    * **Camera hành trình FPV:** Sử dụng điện thoại **Samsung Galaxy S10 5G** gắn trên Kẹp giá kẹp tripod (xoay bằng Servo SG90/MG90S), phát luồng video MJPEG độ nét cao qua ứng dụng IP Webcam.
* **Bộ điều khiển 4 Động cơ:** Ghép song song động cơ trái trước/sau thành cụm Trái, phải trước/sau thành cụm Phải để lái vi sai bằng mạch cầu H L298N.
* **Tay điều khiển MC6C:** Sử dụng cổng ra S.BUS của bộ thu kết nối vào chân **GPIO 16 (RX2)** trên hàng chân G-V-S của đế mở rộng thông qua giao thức Serial ngược cực (Inverted UART 100000 baud).
* **Hạ áp & Cấp nguồn An toàn:** 
  * Dùng nguồn tổng Pin 2S (7.4V - 8.4V) cấp cho L298N nuôi động cơ.
  * Trích nguồn từ **Jack Balance 2S (Dây 1 Đen GND, Dây 3 Đỏ 8.4V)** cấp cho **Mạch hạ áp LM2596** hạ xuống **5.0V chuẩn (chịu tải 3A)** cấp vào cổng VIN & GND của Đế mở rộng ESP32.
  * Rút Jumper 5V Enable trên L298N để cách ly hoàn toàn nguồn Động cơ và nguồn ESP32/Servo, chống nhiễu và sụt áp (Brownout Reset).
* **Quản lý Tính năng (Feature Flags):** Hỗ trợ công tắc tắt mở phần mềm cho cảm biến siêu âm (`ENABLE_ULTRASONIC`) và đo pin (`ENABLE_BATTERY_MONITOR`).
* **Tự động nhận diện IP Máy chủ (mDNS):** ESP32 kết nối WiFi nội bộ và tự tìm kiếm máy chủ Node.js thông qua tên máy tính: `LAPTOP-8EPKMA78.local`.

---

## GIAI ĐOẠN 4: AI Agent Điều khiển xe bằng Ngôn ngữ tự nhiên & Giọng nói (KẾ HOẠCH MỚI CẬP NHẬT)

Giai đoạn này mở rộng khả năng của xe từ việc chỉ nhận lệnh trực tiếp (Joystick/Keyboard) thành một **AI Agent Tự chủ** có khả năng lắng nghe giọng nói, lập kế hoạch đa bước và tương tác bằng ngôn ngữ tự nhiên.

Chi tiết tài liệu kế hoạch triển khai AI Agent & Voice Control: [ke_hoach_ai_agent_voice_control.md](file:///d:/CNTT/duan_esp32/k%E1%BA%BF_ho%E1%BA%A1ch/ke_hoach_ai_agent_voice_control.md)

### Các mốc Sprint chính trong Giai đoạn 4:
* **Sprint 4 (Voice STT):** Frontend Microphone Audio Recorder + Whisper STT Engine (Speech-to-Text).
* **Sprint 5 (LLM & Tool Calling):** Định dạng JSON Schema cho 10 Tools của xe.
* **Sprint 6 (AI Agent Core):** Planner, Short-term Memory, ReAct Loop (Reasoning + Acting) & Dynamic Re-planning.
* **Sprint 7 (Autonomous Guard & TTS):** Hardware Emergency Stop Intercept, Smart Battery Guard (<20%), và Text-to-Speech Voice Feedback.

