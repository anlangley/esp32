// ============================================================================
// SOCKET AUTH MIDDLEWARE — Xác thực JWT cho WebSocket connections
// ============================================================================

import jwt from 'jsonwebtoken';
import { getPool, sql } from '../database/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production';

/**
 * Middleware Socket.IO: Xác thực JWT token khi handshake.
 * Token được gửi qua: socket.handshake.auth.token
 * Nếu hợp lệ → gắn socket.userId, socket.username, socket.userRole, socket.linkedVehicleIds
 * Nếu không → từ chối kết nối
 *
 * Lưu ý: Thiết bị ESP32 (role='device') không cần JWT, chỉ cần token thiết bị.
 */
export function createSocketAuthMiddleware(io) {
  io.use(async (socket, next) => {
    const role = socket.handshake.query.role;

    // ESP32 / Device không cần JWT (xác thực bằng cách khác ở GĐ 4)
    if (role === 'device') {
      return next();
    }

    // Frontend client phải có JWT token
    const token = socket.handshake.auth?.token;

    if (!token) {
      console.log(`[SOCKET AUTH] ❌ Từ chối kết nối: Không có token (IP: ${socket.handshake.address})`);
      return next(new Error('AUTH_REQUIRED'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      socket.userRole = decoded.role;

      // Lấy danh sách xe đã liên kết để kiểm tra quyền điều khiển (GĐ 2.2 & GĐ 4)
      try {
        const pool = await getPool();
        const vResult = await pool.request()
          .input('user_id', sql.Int, decoded.userId)
          .query(`
            SELECT v.id, v.vehicle_code 
            FROM user_vehicles uv
            JOIN vehicles v ON uv.vehicle_id = v.id
            WHERE uv.user_id = @user_id
          `);
        socket.linkedVehicleIds = new Set(vResult.recordset.map((r) => r.id));
        socket.linkedVehicleCodes = new Set(vResult.recordset.map((r) => r.vehicle_code.toUpperCase().trim()));
      } catch {
        socket.linkedVehicleIds = new Set();
        socket.linkedVehicleCodes = new Set();
      }

      console.log(`[SOCKET AUTH] ✅ Xác thực thành công: ${decoded.username} (role: ${decoded.role}, mã xe: ${Array.from(socket.linkedVehicleCodes || []).join(', ') || 'Chưa có'})`);
      next();
    } catch (err) {
      console.log(`[SOCKET AUTH] ❌ Token không hợp lệ: ${err.message}`);
      return next(new Error('INVALID_TOKEN'));
    }
  });
}
