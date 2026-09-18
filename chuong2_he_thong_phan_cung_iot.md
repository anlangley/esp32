Chương 2: Hệ thống phần cứng IoT

Dựa trên dự án điều khiển xe từ xa qua ESP32 (mã nguồn hiện tại), hệ thống phần cứng IoT được thiết kế và xây dựng với các thành phần và kiến trúc như sau:

2.1. Kiến trúc hệ thống IoT

Kiến trúc hệ thống của dự án được xây dựng theo mô hình Client-Server phân tán cục bộ (Local Network) và có khả năng tích hợp điều khiển từ xa truyền thống. Kiến trúc bao gồm 3 lớp chính:

1.  **Lớp Thiết bị (Device Layer / Edge):**
       **Vi điều khiển trung tâm:** Mạch phát triển ESP32 (ESP32 DevKit) đóng vai trò xử lý trung tâm, điều phối toàn bộ các hoạt động đọc cảm biến, xuất tín hiệu điều khiển động cơ và giao tiếp mạng.
       **Cơ cấu chấp hành (Actuators):** Động cơ DC được điều khiển thông qua mạch cầu H (Motor Driver) nhận tín hiệu PWM từ ESP32 để di chuyển (tiến, lùi, rẽ).
       **Cảm biến (Sensors):** Cảm biến siêu âm để đo khoảng cách (tránh vật cản, bám theo vật thể) và mạch phân áp để đo điện áp pin (Battery Monitor).
2.  **Lớp Mạng (Network Layer):**
       **Giao thức không dây:** Hệ thống sử dụng Wi-Fi (chuẩn 802.11 b/g/n) nội bộ. 
       **Giao thức truyền tải:** Sử dụng **WebSockets** để truyền nhận dữ liệu điều khiển theo thời gian thực (Real-time telemetry & control) với độ trễ cực thấp. Ngoài ra có sử dụng UDP để tự động khám phá thiết bị trong mạng (UDP Discovery).
       **Giao thức song song (Fail-safe):** Hệ thống tích hợp song song bộ thu sóng RC truyền thống qua giao thức **S.BUS**, đảm bảo xe vẫn điều khiển được khi mất kết nối Wi-Fi.
3.  **Lớp Ứng dụng (Application Layer / Dashboard):**
       **Phần mềm người dùng:** Một Dashboard trên nền tảng Web/Desktop (được viết bằng TypeScript/React) kết nối đến ESP32 qua WebSockets để truyền lệnh joystick và hiển thị thông số telemetry (Pin, Khoảng cách, Tốc độ, Ping).

---

2.2. Mô hình hệ thống IoT

Mô hình hệ thống của dự án là **Mô hình Điều khiển Vòng kín (Closed-loop Control) và Giám sát Từ xa**.

   **Luồng điều khiển xuống (Downlink):** Người dùng thao tác trên Web Dashboard hoặc tay cầm RC. Tín hiệu (x, y, speed limit) được mã hóa thành JSON và gửi qua WebSockets hoặc gửi qua S.BUS tới ESP32. ESP32 dịch lệnh này thành các mức băm xung (PWM) tương ứng cho hai bên động cơ trái/phải để xe di chuyển.
   **Luồng giám sát lên (Uplink):** 
       Cảm biến siêu âm liên tục phát/thu sóng âm để đo khoảng cách phía trước. Thuật toán xử lý ngắt (Interrupt) non-blocking trên chân ECHO tính toán khoảng cách và gửi về bộ xử lý.
       ADC đọc điện áp từ mạch pin.
       Các dữ liệu này (cùng với RSSI của Wi-Fi) được ESP32 đóng gói và gửi ngược lại Dashboard qua WebSockets định kỳ để hiển thị cho người dùng.
   **Xử lý tại biên (Edge Computing):** ESP32 không chỉ truyền nhận mà còn tự động ra quyết định. Ví dụ: Chức năng `ENABLE_ULTRASONIC_AUTO_REVERSE` cho phép ESP32 tự động đảo chiều động cơ lùi lại khi cảm biến siêu âm phát hiện vật cản ở cự ly quá gần (dưới 7cm) mà không cần đợi lệnh từ Web.

---

2.3. Các thiết bị của hệ thống IoT

Dựa vào bảng kê linh kiện (BOM) của dự án, hệ thống phần cứng bao gồm các thiết bị và module cụ thể sau:

1.  **Mạch vi điều khiển trung tâm (Microcontroller):**
       **ESP32 DevKit V1 (CH340 30P):** Đóng vai trò là "bộ não" trung tâm xử lý dữ liệu, điều khiển các ngoại vi, xử lý thuật toán bám đuổi/tránh vật cản, đồng thời duy trì kết nối Wi-Fi/WebSockets để truyền tải telemetry.
       **Đế mở rộng ESP32 30P Cọc vặn vít (Expansion Board):** Giúp mở rộng chân tín hiệu chuẩn G-V-S (Ground-VCC-Signal) và kết nối dây điện dễ dàng, chắc chắn hơn khi xe di chuyển tốc độ cao.
2.  **Khung gầm và Hệ thống truyền động:**
       **Khung xe Mica 4 bánh (4WD Chassis):** Khung 2 tầng (tầng trên chứa pin/mạch phát sóng, tầng giữa chứa ESP32 và L298N).
       **Động cơ giảm tốc vàng + Bánh xe (4 bộ):** Chịu trách nhiệm truyền động lực chính cho xe. Hai động cơ cùng một bên (trái/phải) sẽ được đấu song song với nhau.
       **Mạch cầu H L298N (Motor Driver):** Nhận tín hiệu PWM từ ESP32 để điều khiển tốc độ và đảo chiều quay (tiến/lùi) độc lập cho 2 dải bánh xe trái và phải.
3.  **Hệ thống cảm biến và giám sát:**
       **Cảm biến khoảng cách siêu âm HC-SR04:** Được dùng để đo cự ly vật cản phía trước, phục vụ tính năng phanh tự động khẩn cấp và bám theo mục tiêu.
       **Mạch phân áp:** Biến đổi điện áp từ 8.4V (Pin 2S) xuống mức an toàn (<3.3V) đưa vào chân ADC của ESP32, giúp giám sát phần trăm pin (Battery Telemetry) từ xa.
4.  **Hệ thống nguồn cấp (Power Supply):**
       **Pin Tattu LiPo 2S 450mAh 75C/18650 2000mAh (7.4V-8.4V):** Nguồn chính cung cấp dòng xả cao cho động cơ hoạt động mượt mà và các mạch điều khiển.
       **Mạch hạ áp DC-DC LM2596:** Nhận điện áp từ cổng Balance của pin 2S, hạ áp ổn định ở mức 5V để nuôi an toàn cho mạch ESP32 và các module điện tử khác.
5.  **Hệ thống điều khiển dự phòng (RC Failsafe):**
       **Tay điều khiển MC6C + Receiver MC7RB:** Bộ điều khiển vật lý dùng sóng Radio, xuất tín hiệu giao thức S.BUS truyền về chân RX của ESP32. Cho phép người dùng trực tiếp kiểm soát xe không độ trễ ngay cả khi mạng Wi-Fi bị mất (Failsafe).
6.  **Các phụ kiện khác:** Servo SG90 (hỗ trợ quay camera nếu gắn thêm, quay cảm biến), Công tắc bập bênh (đóng/ngắt nguồn pin tổng), dây Dupont và băng dính Velcro cố định pin.

---

2.4. Thực nghiệm và Demo trên phần cứng thực tế

Vì hệ thống đã được trang bị phần cứng hoàn chỉnh, bước thực nghiệm và demo sẽ được tiến hành trực tiếp trên các thiết bị vật lý nhằm đánh giá chính xác hiệu năng, độ trễ và khả năng đáp ứng của hệ thống.

2.4.1. Quy trình nạp Firmware và Cấu hình
1.  **Nạp Code lần đầu qua Serial (Cáp USB):** 
       Kết nối ESP32 với máy tính qua cổng USB (ví dụ: COM3).
       Sử dụng PlatformIO biên dịch và nạp firmware theo môi trường `env:esp32dev` (`monitor_speed = 115200`).
2.  **Nạp Code không dây (OTA - Over The Air):**
       Do ESP32 được cấu hình IP tĩnh (`192.168.1.200`), các lần cập nhật code tiếp theo sẽ sử dụng cấu hình `env:esp32-ota` trong `platformio.ini` để nạp trực tiếp qua mạng Wi-Fi mà không cần cắm cáp, rất tiện lợi cho việc căn chỉnh khi xe đang chạy trên sa hình.

2.4.2. Quá trình Kiểm thử (Testing) và Demo
Các bài test được thực hiện trực tiếp trên phần cứng bao gồm:

   **Test Điều khiển Động cơ (Motor PWM Test):**
       *Mục đích:* Kiểm tra IC cầu H (Motor Driver) có cấp đúng chiều và đủ dòng cho động cơ trái/phải hay không.
       *Thực hiện:* Kéo thả Joystick trên Web Dashboard. ESP32 sẽ băm xung PWM tần số 20kHz (hạn chế tiếng kêu rít). Đánh giá khả năng tăng tốc, đảo chiều, và tỷ lệ tốc độ hai bánh khi rẽ.
   **Test Cảm biến Siêu âm (Ultrasonic & Non-blocking ISR):**
       *Mục đích:* Xác minh thuật toán ngắt (Interrupt) trên chân `ECHO` hoạt động mượt mà, không làm treo hệ thống điều khiển mạng.
       *Thực hiện:* Đặt tay trước xe để thay đổi khoảng cách liên tục. Quan sát Dashboard cập nhật khoảng cách theo thời gian thực.
       *Demo tính năng Auto-Reverse:* Cho xe chạy tiến thẳng vào tường. Khi cách tường < 7cm (`ULTRASONIC_ALARM_DIST_CM`), hệ thống phải tự động đảo chiều động cơ (PWM = -204) và lùi lại trong 3 giây để tránh va chạm bất kể người dùng có đang giữ phím tiến hay không.
   **Test Tích hợp Hệ thống (WebSockets & Telemetry):**
       *Mục đích:* Kiểm tra độ ổn định của luồng dữ liệu 2 chiều.
       *Thực hiện:* Vừa điều khiển xe chạy vòng quanh bằng Dashboard, vừa quan sát sự thay đổi của mức pin (`PIN_BATTERY_ADC 34`), tốc độ, tín hiệu RSSI và ping (latency) hiển thị trên giao diện theo chu kỳ ngắn.
   **Test Tính năng Dự phòng (S.BUS Failsafe):**
       *Mục đích:* Đảm bảo an toàn khi mất sóng Wi-Fi.
       *Thực hiện:* Bật tay điều khiển RC truyền thống (chuyển Mode qua kênh CH6). Kiểm tra tính năng ghi đè quyền điều khiển (Override). Tắt router Wi-Fi đột ngột, xe vẫn phải tiếp tục được điều khiển bình thường bằng tay cầm RC thông qua giao thức S.BUS.

Việc demo trực tiếp trên phần cứng chứng minh được thuật toán điều khiển hỗn hợp (WebSockets kết hợp RC Failsafe và ngắt cảm biến không đồng bộ) hoạt động ổn định trong thực tế, mang lại trải nghiệm điều khiển độ trễ thấp và an toàn.
