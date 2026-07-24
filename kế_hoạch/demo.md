# Kế hoạch Triển khai Nút DEMO & Game Mô phỏng Lái Xe trên Màn hình Camera

Thêm 1 nút **DEMO** trên giao diện màn hình Camera. Khi bấm vào, màn hình camera sẽ chuyển đổi thành **Game mô phỏng điều khiển xe ô tô (2D/Cyberpunk Physics Simulator)** với đầy đủ các chức năng điều khiển và cảm biến như đã thiết lập.

## User Review Required

> [!IMPORTANT]
> **Điểm nổi bật của Chế độ Demo:**
> 1. **Mô phỏng Vật lý & Đồ họa Cyberpunk:** Xe ô tô cybernetic di chuyển mượt mà trên bản đồ lưới neon với đèn pha, vệt bánh xe, cảm biến siêu âm quét vật cản và các rào chắn.
> 2. **Đồng bộ tất cả các Bộ điều khiển:** Phim bàn phím (WASD), Tay cầm Joystick ảo, Chuột trên màn hình Camera, và Gamepad USB đều điều khiển trực tiếp chiếc xe mô phỏng.
> 3. **Tự động Phản hồi Telemetry:** Cảm biến khoảng cách siêu âm (Ultrasonic distance sensor) trong game tính toán khoảng cách đến vật cản gần nhất theo thời gian thực và tự động kích hoạt **Cảnh báo Va chạm** (Distance < 30cm) trên bảng điều khiển và hệ thống Log.

## Proposed Changes

---

### Frontend Component

#### [NEW] [CarSimulatorGame.tsx](file:///d:/CNTT/duan_esp32/frontend/src/components/CarSimulatorGame.tsx)
- Tạo component Game Mô phỏng Lái xe 2D Canvas thế hệ mới.
- Tích hợp động cơ vật lý xe RC: Gia tốc, phanh, ma sát, góc bẻ lái, đèn pha, cảm biến khoảng cách Radar/Sonar bằng Raycasting.
- Cập nhật dữ liệu Telemetry (Tốc độ, Khoảng cách vật cản, Pin, Nhiệt độ động cơ, RTT) về `App.tsx` liên tục theo thời gian thực.
- Hỗ trợ chế độ lái chuột, phím bấm WASD, Joystick và Gamepad.

#### [MODIFY] [CameraStream.tsx](file:///d:/CNTT/duan_esp32/frontend/src/components/CameraStream.tsx)
- Thêm nút **`🎮 DEMO`** trên thanh công cụ camera header với hiệu ứng Neon nổi bật.
- Quản lý trạng thái `isDemoMode`.
- Khi `isDemoMode` bật, hiển thị game canvas `<CarSimulatorGame />` thay thế luồng camera IP, đồng thời giữ nguyên các nút điều khiển âm thanh, góc xoay và cài đặt.

#### [MODIFY] [App.tsx](file:///d:/CNTT/duan_esp32/frontend/src/App.tsx)
- Cho phép nhận dữ liệu Telemetry mô phỏng từ `CarSimulatorGame` khi ở chế độ Demo.
- Thêm thông báo nhật ký hệ thống khi bật/tắt chế độ Demo Game.

---

## Verification Plan

### Manual Verification
1. **Kiểm tra nút DEMO:** Bấm vào nút `🎮 DEMO` ở góc trên màn hình Camera để bật/tắt chế độ game.
2. **Kiểm tra Điều khiển Xe trong Game:**
   - Sử dụng phím **W-A-S-D** hoặc các phím mũi tên.
   - Di di chuyển **Chuột** trên khung hình Game.
   - Kéo **Joystick** ở góc dưới.
   - Thay đổi thanh **Giới hạn tốc độ (%)**.
3. **Kiểm tra Cảm biến & Telemetry:**
   - Lái xe tiến gần đến rào chắn/chướng ngại vật trong game.
   - Xác nhận bảng Telemetry hiển thị khoảng cách cm giảm dần và hiển thị cảnh báo đỏ khi khoảng cách < 30cm.
