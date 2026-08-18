# 📖 HƯỚNG DẪN CHI TIẾT CẮM DÂY PHẦN CỨNG XE IOT ESP32
> **Phiên bản:** Không Servo quay camera | **Đồng bộ 100% với file:** `firmware/firmware.ino`

---

## 🛠️ I. DỤNG CỤ VÀ LINH KIỆN CẦN CHUẨN BỊ

1. **Bộ não & Bo mở rộng:** Bo mạch ESP32 DevKit V1 + Đế mở rộng 30 Pin (chuẩn cọc G-V-S / cọc vặn vít).
2. **Khối công suất:** Mạch điều khiển động cơ L298N (Mạch màu đỏ) + 4 Động cơ DC vàng giảm tốc.
3. **Khối nguồn:** Pin LiPo 2S (7.4V - 8.4V) + Mạch hạ áp LM2596 + Công tắc bập bênh ON/OFF.
4. **Khối điều khiển & cảm biến:** Bộ thu Tay điều khiển MC7RB (chế độ S.BUS) + Cảm biến siêu âm HC-SR04.
5. **Dây cắm:** Dây bus Dupont (Đực - Cái & Cái - Cái), 1 tô vít nhỏ.

---

## ⚡ II. BƯỚC 1: CHUẨN BỊ BO MẠCH L298N & HẠ ÁP LM2596

### 1. Thao tác trên Mạch cầu H L298N (Rất quan trọng)
* ✂️ **Tháo 2 nắp nhựa màu đen (Jumper)** ở vị trí chân **ENA** và **ENB** trên bo L298N ra. *(Nếu không tháo, xe sẽ chỉ chạy max 100% tốc độ, không điều tốc nhanh chậm được)*.
* 🔒 **Giữ nguyên nắp Jumper 5V Enable** (nằm ngay phía sau cọc vặn vít nguồn 3 chân).

### 2. Cài đặt điện áp Mạch hạ áp LM2596
* 🔌 Cắm nguồn Pin 2S (7.4V - 8.4V) vào 2 chân **IN+** và **IN-** của LM2596.
* 🪛 Dùng đồng hồ vặn chiết áp nhỏ trên LM2596 để đo đầu ra **OUT+ / OUT-** đúng **5.0V** rồi mới kết nối tới ESP32.

---

## 🔌 III. BƯỚC 2: ĐẮM DÂY KHỐI NGUỒN TỔNG

```text
 ┌────────────────┐         Công tắc ON/OFF
 │ PIN LiPo 2S    ├───────[  /  ]────────┬───────────────────────┐ (+) 8.4V
 │ (7.4V - 8.4V)  ├──────────────────────┼─────────────────┐     │
 └────────────────┘                      │ (-) GND         │     │
                                         ▼                 ▼     ▼
                                  ┌─────────────┐   ┌────────────────┐
                                  │ LM2596 IN-  │   │ L298N  GND 12V │
                                  │ LM2596 IN+  │◄──┼────────┘   ▲   │
                                  └──────┬──────┘   └────────────┼───┘
                                         │ OUT (Đã chỉnh 5V)     │
                                         ▼                       │
                                  ┌─────────────┐                │
                                  │ Đế ESP32 5V │                │
                                  │ Đế ESP32 GND├────────────────┘ (Nối chung GND toàn hệ thống)
                                  └─────────────┘
```

1. **Dây Dương (+ 8.4V):** Nối từ Pin LiPo 2S ➔ Qua **Công tắc ON/OFF** ➔ Rẽ làm 2 nhánh:
   * Nhánh A ➔ Cắm vào cọc **12V** của bo L298N.
   * Nhánh B ➔ Cắm vào chân **IN+** của LM2596.
2. **Dây Âm (- GND):** Nối từ Pin LiPo 2S ➔ Cắm chung vào chân **IN-** (LM2596), cọc **GND** (L298N), và cọc **GND** (Đế mở rộng ESP32).
3. **Dây 5V nuôi ESP32:** Nối từ chân **OUT+ (5V)** của LM2596 vào cọc **5V/VIN** trên Đế mở rộng ESP32.

---

## 🕹️ IV. BƯỚC 3: CẮM DÂY TÍN HIỆU VÀO ĐẾ MỞ RỘNG ESP32 (G-V-S)

### 1. Đấu nối L298N với Động cơ & ESP32
* **Nối động cơ:**
  * 2 Động cơ bên **Trái** ➔ Nối song song vào cọc **OUT1 & OUT2** của L298N.
  * 2 Động cơ bên **Phải** ➔ Nối song song vào cọc **OUT3 & OUT4** của L298N.
* **Cắm dây điều khiển vào Đế ESP32:**

| Chân trên L298N | Chân cắm Đế ESP32 | Loại dây | Chức năng |
| :--- | :--- | :--- | :--- |
| **ENA** *(Đã tháo nắp)* | **GPIO 25** (Hàng S) | Đực - Cái | Điều tốc PWM bánh Trái |
| **IN1** | **GPIO 26** (Hàng S) | Đực - Cái | Hướng quay bánh Trái 1 |
| **IN2** | **GPIO 27** (Hàng S) | Đực - Cái | Hướng quay bánh Trái 2 |
| **ENB** *(Đã tháo nắp)* | **GPIO 14** (Hàng S) | Đực - Cái | Điều tốc PWM bánh Phải |
| **IN3** | **GPIO 12** (Hàng S) | Đực - Cái | Hướng quay bánh Phải 1 |
| **IN4** | **GPIO 13** (Hàng S) | Đực - Cái | Hướng quay bánh Phải 2 |

---

### 2. Cắm Tay thu Tay điều khiển MC7RB (Tín hiệu S.BUS)
> Dùng 1 sợi dây Dupont 3 nhánh (hoặc dây jack cắm 3 chân):

| Chân trên Bộ Thu MC7RB | Chân cắm Đế ESP32 | Vị trí cụm G-V-S |
| :--- | :--- | :--- |
| **Chân Tín hiệu (S.BUS)** | **GPIO 16** | Hàng **S** (Signal) |
| **Chân Dương (+ 5V)** | Cụm chân **GPIO 16** | Hàng **V** (VCC) |
| **Chân Âm (- GND)** | Cụm chân **GPIO 16** | Hàng **G** (Ground) |

---

### 3. Cắm Cảm biến Siêu âm HC-SR04 (Phanh tự động)

| Chân trên HC-SR04 | Chân cắm Đế ESP32 | Vị trí cụm G-V-S |
| :--- | :--- | :--- |
| **Trig** | **GPIO 32** | Hàng **S** (Signal) |
| **Echo** | **GPIO 33** | Hàng **S** (Signal) |
| **VCC** | Cụm chân 5V bất kỳ | Hàng **V** (VCC) |
| **GND** | Cụm chân GND bất kỳ | Hàng **G** (Ground) |

---

## 🔍 V. CHECKLIST KIỂM TRA & BẬT NGUỒN CHẠY THỬ

1. **Kiểm tra ngắn mạch:** Đảm bảo dây Dương (+) và Âm (-) của Pin không dính vào nhau.
2. **Kiểm tra công tắc:** Tắt công tắc nguồn ON/OFF trước khi cắm Pin.
3. **Nạp Firmware:** 
   * Cắm dây USB trực tiếp vào mạch ESP32 để nạp code `firmware/firmware.ino`.
   * Rút dây USB ra khỏi máy tính sau khi nạp thành công.
4. **Bật nguồn xe:** 
   * Bật công tắc bập bênh ON/OFF.
   * Quan sát đèn LED đỏ trên ESP32, L298N và Tay thu MC7RB sáng đều.
5. **Kiểm tra chiều quay bánh xe:**
   * Gạt cần ga tiến trên Tay điều khiển MC6C: Nếu có bánh bị quay ngược chiều, bạn chỉ cần đảo 2 vị trí dây động cơ đó tại cọc vặn OUT của L298N là xong!
