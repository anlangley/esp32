#include "sbus_parser.h"

static uint8_t sbusPacket[25];
static int sbusIndex = 0;
static unsigned long lastSbusByteTime = 0;

void initSbusParser() {
  // Baudrate 100000, SERIAL_8E2, Rx Pin = PIN_RC_SBUS_RX, Tx Pin = -1, invert = true
  Serial2.begin(100000, SERIAL_8E2, PIN_RC_SBUS_RX, -1, true);
  Serial.println("[S.BUS] Khởi tạo Serial2 đọc bộ thu MC6C thành công.");
}

void parseSbusStream(RCState &rcState) {
  while (Serial2.available() > 0) {
    uint8_t c = Serial2.read();

    // Đồng bộ gói tin mới nếu quá 4ms không nhận được byte nào
    if (millis() - lastSbusByteTime > 4) {
      sbusIndex = 0;
    }
    lastSbusByteTime = millis();

    // Byte đầu tiên của khung S.BUS luôn là 0x0F
    if (sbusIndex == 0 && c != 0x0F) {
      continue;
    }

    sbusPacket[sbusIndex++] = c;

    // Đã nhận đủ khung 25 bytes
    if (sbusIndex == 25) {
      sbusIndex = 0;

      // 1. Kiểm tra Footer byte (Byte 24)
      if ((sbusPacket[24] & 0x0F) != 0x00 && sbusPacket[24] != 0x00) {
        continue; // Frame lỗi
      }

      // 2. Kiểm tra cờ Failsafe / Frame Lost (Byte 23)
      rcState.isFrameLost = (sbusPacket[23] & 0x04) != 0;
      rcState.isFailsafe  = (sbusPacket[23] & 0x08) != 0;

      if (rcState.isFailsafe || rcState.isFrameLost) {
        continue;
      }

      // Giải mã 11-bit cho 6 kênh
      int rawCh1 = ((sbusPacket[1] | sbusPacket[2] << 8) & 0x07FF);
      int rawCh2 = ((sbusPacket[2] >> 3 | sbusPacket[3] << 5) & 0x07FF);
      int rawCh3 = ((sbusPacket[3] >> 6 | sbusPacket[4] << 2 | sbusPacket[5] << 10) & 0x07FF);
      int rawCh4 = ((sbusPacket[5] >> 1 | sbusPacket[6] << 7) & 0x07FF);
      int rawCh5 = ((sbusPacket[6] >> 4 | sbusPacket[7] << 4) & 0x07FF);
      int rawCh6 = ((sbusPacket[7] >> 7 | sbusPacket[8] << 1 | sbusPacket[9] << 9) & 0x07FF);

      // Quy đổi S.BUS raw (172 - 1811) sang độ rộng xung servo (1000us - 2000us)
      rcState.ch1 = constrain((rawCh1 - 992) * 500 / 820 + 1500, 1000, 2000);
      rcState.ch2 = constrain((rawCh2 - 992) * 500 / 820 + 1500, 1000, 2000);
      rcState.ch3 = constrain((rawCh3 - 992) * 500 / 820 + 1500, 1000, 2000);
      rcState.ch4 = constrain((rawCh4 - 992) * 500 / 820 + 1500, 1000, 2000);
      rcState.ch5 = constrain((rawCh5 - 992) * 500 / 820 + 1500, 1000, 2000);
      rcState.ch6 = constrain((rawCh6 - 992) * 500 / 820 + 1500, 1000, 2000);

      rcState.lastValidTime = millis();
    }
  }
}
