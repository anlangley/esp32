# Kế hoạch Mô phỏng & Tích hợp Đa giao thức mạng IoT (Multi-Protocol Simulation)

Đề bài yêu cầu: **Lấy ví dụ dự án xe IoT - Mô phỏng giao thức mạng không dây trong IoT (MQTT, HTTP, CoAP...)**.

Để đáp ứng chính xác yêu cầu học thuật này, dự án xe IoT hiện tại (đang dùng WebSocket) sẽ được nâng cấp thành một hệ thống **Đa giao thức (Multi-Protocol)**. Mục tiêu là cho phép thiết bị (cả mô phỏng lẫn xe ESP32 thực tế) có thể linh hoạt chuyển đổi giữa các giao thức mạng khác nhau. Từ đó, sinh viên có thể demo, đo lường và đưa ra bảng so sánh hiệu năng trực quan giữa các giao thức này.

## User Review Required
> [!IMPORTANT]
> **Giới hạn phạm vi (Scope):** Kế hoạch dưới đây đề xuất tích hợp **HTTP (REST)**, **MQTT** và giữ lại **WebSocket**. Giao thức **CoAP** tuy ít phổ biến hơn MQTT nhưng nếu giảng viên *bắt buộc* thì em sẽ đưa vào thêm. Anh/chị xác nhận giúp em có cần làm luôn CoAP không nhé?

## Open Questions
> [!NOTE]
> 1. Anh/chị muốn tích hợp MQTT Broker (như Aedes) thẳng vào Node.js Backend cho tiện chạy cục bộ, hay muốn dùng một Broker bên thứ ba (như HiveMQ / Mosquitto / EMQX)?
> 2. Anh/chị có muốn tạo thêm một trang "Dashboard Benchmark" trên Web để show biểu đồ so sánh độ trễ (Latency) giữa 3 giao thức lúc báo cáo đồ án không?

---

## Proposed Changes

### 1. Nâng cấp Node.js Backend Server (Đa giao thức)
Backend hiện tại chỉ mở cổng WebSocket. Sẽ cần cấu trúc lại để lắng nghe đồng thời trên nhiều giao thức, và hội tụ dữ liệu điều khiển về chung một luồng xử lý.

#### [MODIFY] `backend/server.js`
- **HTTP/REST Endpoint**: Bổ sung router `POST /api/telemetry` để nhận dữ liệu cảm biến và `GET /api/command` để xe lấy lệnh điều khiển (Mô phỏng mô hình HTTP Polling).
- **MQTT Broker/Client**: Tích hợp module MQTT.
  - Lắng nghe topic: `iotcar/telemetry` (Xe gửi dữ liệu lên).
  - Xuất bản topic: `iotcar/command/drive` (Server gửi lệnh lái xuống).
- (Tùy chọn) **CoAP Server**: Khởi tạo UDP CoAP Server dùng thư viện `coap` của Node.js.

### 2. Cập nhật thiết bị ảo (Virtual Simulator)
Phục vụ cho việc chạy mô phỏng không cần xe thật.

#### [MODIFY] `backend/mock_device.js`
- Viết lại thành cấu trúc class/module, cho phép truyền tham số khi khởi chạy (Ví dụ: `node mock_device.js --protocol=mqtt`).
- Thiết bị ảo sẽ thay đổi cách đóng gói tin nhắn tùy theo giao thức được chọn (ví dụ: HTTP thì đóng gói Header + Body, MQTT thì đóng gói cực nhỏ gọn, WebSocket thì truyền trực tiếp).

### 3. Nâng cấp ESP32 Firmware (Multi-Protocol Switch)
Làm cho mã nguồn C++ của ESP32 trở thành một "bài lab" thực thụ về mạng IoT.

#### [MODIFY] `firmware/esp32/src/network_manager.cpp`
- Bổ sung thư viện `PubSubClient` (cho MQTT) và `HTTPClient` (cho REST API).
- Dùng các Macro `#define PROTOCOL_MODE MODE_MQTT` ở đầu file. Khi cần báo cáo giao thức nào, chỉ cần đổi Macro và nạp lại code.
- **Cách hoạt động**:
  - `MODE_HTTP`: Gọi API định kỳ mỗi 500ms (Sẽ thấy xe bị giật cục do trễ cao).
  - `MODE_MQTT`: Kết nối Broker, phản hồi mượt hơn, cực kỳ tiết kiệm băng thông.
  - `MODE_WS`: Kết nối luồng liên tục, trễ cực thấp (phục vụ truyền hình FPV tốt nhất).

### 4. Báo cáo đánh giá (Evaluation Dashboard)
Để lấy điểm tối đa, dự án sẽ có thêm tính năng ghi nhận số liệu.

#### [NEW] `frontend/src/pages/Benchmark.tsx`
- Trang giao diện mới chuyên phục vụ báo cáo.
- Hiển thị biểu đồ Real-time:
  - **Latency (Độ trễ):** Thời gian từ lúc phát lệnh đến lúc xe nhận lệnh.
  - **Payload Size:** So sánh kích thước gói tin tĩnh (HTTP Header phình to vs MQTT Header siêu nhỏ (2 bytes)).
  - **Connection Overhead:** Chi phí thiết lập kết nối (TCP Handshake của HTTP vs Keep-Alive của MQTT).

---

## Verification Plan

### Manual Verification
1. **Khởi chạy Simulator với MQTT**: Chạy `node mock_device.js --protocol=mqtt`. Dùng phần mềm MQTT Explorer kết nối vào Broker nội bộ, kiểm tra xem có thấy gói tin telemetry của xe liên tục bắn lên topic không.
2. **Kiểm tra luồng HTTP Polling**: Chạy xe ở mode HTTP, vào Web UI gạt joystick. Giao diện Web phải vẫn đẩy lệnh xuống Backend bình thường, Backend lưu vào bộ đệm tạm chờ xe gửi `GET` request lên lấy lệnh về.
3. **Mở Benchmark Dashboard**: Xác minh các biểu đồ có vẽ ra sự chênh lệch rõ rệt về thời gian đáp ứng (ms) giữa HTTP và MQTT/WS.
