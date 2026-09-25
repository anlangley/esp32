// ============================================================================
// VEHICLE CONTROLLER — CRUD xe, liên kết mã xe, hủy liên kết
// ============================================================================

import { getPool, sql } from '../database/db.js';

/**
 * POST /api/vehicles/link — Nhập mã xe để liên kết với tài khoản
 */
export async function linkVehicle(req, res) {
  try {
    const { vehicleCode, pinCode } = req.body;
    const userId = req.user.userId;

    if (!vehicleCode) {
      return res.status(400).json({ success: false, message: 'Thiếu mã xe.' });
    }

    const pool = await getPool();

    // Tìm xe theo vehicle_code
    const vehicleResult = await pool.request()
      .input('vehicle_code', sql.NVarChar, vehicleCode.toUpperCase().trim())
      .query('SELECT * FROM vehicles WHERE vehicle_code = @vehicle_code');

    if (vehicleResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Mã xe không tồn tại trên hệ thống.' });
    }

    const vehicle = vehicleResult.recordset[0];

    // BẢO MẬT XE THẬT: Nếu xe có mã PIN bảo mật phần cứng, bắt buộc phải nhập đúng PIN
    if (vehicle.pin_code && vehicle.pin_code.trim().length > 0) {
      const inputPin = (pinCode || '').trim();
      if (!inputPin) {
        return res.status(400).json({
          success: false,
          requiresPin: true,
          message: 'Xe thật yêu cầu Mã PIN bảo mật phần cứng để liên kết! Vui lòng nhập mã PIN.',
        });
      }
      if (inputPin !== vehicle.pin_code.trim()) {
        return res.status(403).json({
          success: false,
          requiresPin: true,
          message: 'Mã PIN bảo mật xe thật không chính xác!',
        });
      }
    }

    // Kiểm tra đã liên kết chưa
    const existingLink = await pool.request()
      .input('user_id', sql.Int, userId)
      .input('vehicle_id', sql.Int, vehicle.id)
      .query('SELECT id FROM user_vehicles WHERE user_id = @user_id AND vehicle_id = @vehicle_id');

    if (existingLink.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Xe này đã được liên kết với tài khoản của bạn.' });
    }

    // Tạo liên kết mới
    await pool.request()
      .input('user_id', sql.Int, userId)
      .input('vehicle_id', sql.Int, vehicle.id)
      .input('role', sql.NVarChar, 'driver')
      .query(`
        INSERT INTO user_vehicles (user_id, vehicle_id, role)
        VALUES (@user_id, @vehicle_id, @role)
      `);

    console.log(`[VEHICLE] ✅ Liên kết xe: User ${req.user.username} ↔ ${vehicle.name} (${vehicleCode})`);

    res.json({
      success: true,
      message: `Đã liên kết xe "${vehicle.name}" thành công!`,
      vehicle: {
        id: vehicle.id,
        vehicleCode: vehicle.vehicle_code,
        name: vehicle.name,
        description: vehicle.description,
        status: vehicle.status,
      },
    });
  } catch (err) {
    console.error('[VEHICLE] ❌ Lỗi liên kết xe:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
}

/**
 * GET /api/vehicles/my — Danh sách xe đã liên kết với tài khoản
 */
export async function getMyVehicles(req, res) {
  try {
    const pool = await getPool();

    const result = await pool.request()
      .input('user_id', sql.Int, req.user.userId)
      .query(`
        SELECT v.id, v.vehicle_code, v.name, v.description, v.status, v.hardware_id,
               uv.role AS user_role, uv.linked_at
        FROM user_vehicles uv
        JOIN vehicles v ON uv.vehicle_id = v.id
        WHERE uv.user_id = @user_id
        ORDER BY uv.linked_at DESC
      `);

    res.json({
      success: true,
      vehicles: result.recordset.map(v => ({
        id: v.id,
        vehicleCode: v.vehicle_code,
        name: v.name,
        description: v.description,
        status: v.status,
        hardwareId: v.hardware_id,
        userRole: v.user_role,
        linkedAt: v.linked_at,
      })),
    });
  } catch (err) {
    console.error('[VEHICLE] ❌ Lỗi lấy danh sách xe:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
}

/**
 * DELETE /api/vehicles/unlink/:id — Hủy liên kết xe
 */
export async function unlinkVehicle(req, res) {
  try {
    const vehicleId = parseInt(req.params.id);
    const userId = req.user.userId;

    if (isNaN(vehicleId)) {
      return res.status(400).json({ success: false, message: 'ID xe không hợp lệ.' });
    }

    const pool = await getPool();

    const result = await pool.request()
      .input('user_id', sql.Int, userId)
      .input('vehicle_id', sql.Int, vehicleId)
      .query('DELETE FROM user_vehicles WHERE user_id = @user_id AND vehicle_id = @vehicle_id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy liên kết xe này.' });
    }

    console.log(`[VEHICLE] ✅ Hủy liên kết xe: User ${req.user.username} ↔ Vehicle ID ${vehicleId}`);
    res.json({ success: true, message: 'Đã hủy liên kết xe.' });
  } catch (err) {
    console.error('[VEHICLE] ❌ Lỗi hủy liên kết:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
}

/**
 * POST /api/vehicles/create — Tạo xe mới (Admin only)
 */
export async function createVehicle(req, res) {
  try {
    const { vehicleCode, name, description } = req.body;

    if (!vehicleCode) {
      return res.status(400).json({ success: false, message: 'Thiếu mã xe (vehicleCode).' });
    }

    const pool = await getPool();

    // Kiểm tra mã xe đã tồn tại chưa
    const existing = await pool.request()
      .input('vehicle_code', sql.NVarChar, vehicleCode.toUpperCase().trim())
      .query('SELECT id FROM vehicles WHERE vehicle_code = @vehicle_code');

    if (existing.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Mã xe đã tồn tại.' });
    }

    const result = await pool.request()
      .input('vehicle_code', sql.NVarChar, vehicleCode.toUpperCase().trim())
      .input('name', sql.NVarChar, name || `Xe ${vehicleCode}`)
      .input('description', sql.NVarChar, description || '')
      .query(`
        INSERT INTO vehicles (vehicle_code, name, description)
        OUTPUT INSERTED.*
        VALUES (@vehicle_code, @name, @description)
      `);

    const vehicle = result.recordset[0];
    console.log(`[VEHICLE] ✅ Tạo xe mới: ${vehicle.name} (${vehicle.vehicle_code})`);

    res.status(201).json({
      success: true,
      vehicle: {
        id: vehicle.id,
        vehicleCode: vehicle.vehicle_code,
        name: vehicle.name,
        description: vehicle.description,
        status: vehicle.status,
      },
    });
  } catch (err) {
    console.error('[VEHICLE] ❌ Lỗi tạo xe:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
}
