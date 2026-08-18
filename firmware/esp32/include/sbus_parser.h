#ifndef SBUS_PARSER_H
#define SBUS_PARSER_H

#include "config.h"

// Khởi tạo Serial2 đọc bộ thu MC6C chế độ S.BUS
void initSbusParser();

// Đọc và giải mã dữ liệu S.BUS từ UART Serial2 (Gọi liên tục trong task control)
void parseSbusStream(RCState &rcState);

#endif // SBUS_PARSER_H
