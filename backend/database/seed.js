// ============================================================================
// SEED SCRIPT — Tạo dữ liệu mẫu: 1 admin mặc định + 1 xe test
// Chạy: node database/seed.js
// ============================================================================

import { getPool, sql, closePool } from './db.js';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12');

async function seed() {
  try {
    const pool = await getPool();

    // 1. Tạo tài khoản admin mặc định
    const adminUsername = 'admin';
    const adminEmail = 'admin@iotcar.local';
    const adminPassword = 'admin123'; // Mật khẩu mặc định, nên đổi khi deploy
    const adminHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);

    // Kiểm tra đã tồn tại chưa
    const existingAdmin = await pool.request()
      .input('username', sql.NVarChar, adminUsername)
      .query('SELECT id FROM users WHERE username = @username');

    if (existingAdmin.recordset.length === 0) {
      await pool.request()
        .input('username', sql.NVarChar, adminUsername)
        .input('email', sql.NVarChar, adminEmail)
        .input('password_hash', sql.NVarChar, adminHash)
        .input('display_name', sql.NVarChar, 'Quản trị viên')
        .input('role', sql.NVarChar, 'admin')
        .query(`
          INSERT INTO users (username, email, password_hash, display_name, role)
          VALUES (@username, @email, @password_hash, @display_name, @role)
        `);
      console.log(`[SEED] ✅ Đã tạo tài khoản admin: ${adminUsername} / ${adminPassword}`);
    } else {
      console.log(`[SEED] ℹ️  Tài khoản admin đã tồn tại, bỏ qua.`);
    }

    // 2. Tạo danh sách xe: Xe Thật ESP32 (Đọc bí mật từ file .env) và Xe Mô Phỏng Demo
    const realCarCode = process.env.REAL_CAR_CODE ? process.env.REAL_CAR_CODE.toUpperCase().trim() : null;
    const realCarPin = process.env.REAL_CAR_PIN ? process.env.REAL_CAR_PIN.trim() : null;

    const defaultVehicles = [];

    // Chỉ nạp xe thật nếu được cấu hình trong file .env bí mật (được .gitignore bảo vệ)
    if (realCarCode && realCarPin) {
      defaultVehicles.push({
        code: realCarCode,
        name: 'Xe Thật ESP32',
        desc: 'Xe ô tô IoT phần cứng thực tế ESP32',
        status: 'offline',
        pin: realCarPin,
      });
    } else {
      console.warn('[SEED] ⚠️ Không tìm thấy REAL_CAR_CODE hoặc REAL_CAR_PIN trong .env! Bỏ qua tạo xe thật.');
    }

    // Luôn tạo xe mô phỏng Demo công khai
    defaultVehicles.push({
      code: 'CAR-A1B2C3',
      name: 'Xe Mô Phỏng (Demo Ảo)',
      desc: 'Xe mô phỏng buồng lái 2D để test và chạy demo',
      status: 'online',
      pin: null,
    });

    const adminRecord = await pool.request()
      .input('username', sql.NVarChar, adminUsername)
      .query('SELECT id FROM users WHERE username = @username');
    const adminId = adminRecord.recordset[0]?.id;

    for (const v of defaultVehicles) {
      const existing = await pool.request()
        .input('code', sql.NVarChar, v.code)
        .query('SELECT id FROM vehicles WHERE vehicle_code = @code');

      let vehicleId = existing.recordset[0]?.id;

      if (!vehicleId) {
        const insertRes = await pool.request()
          .input('code', sql.NVarChar, v.code)
          .input('name', sql.NVarChar, v.name)
          .input('desc', sql.NVarChar, v.desc)
          .input('status', sql.NVarChar, v.status)
          .input('pin', sql.NVarChar, v.pin)
          .query(`
            INSERT INTO vehicles (vehicle_code, name, description, status, pin_code)
            OUTPUT INSERTED.id
            VALUES (@code, @name, @desc, @status, @pin)
          `);
        vehicleId = insertRes.recordset[0].id;
        console.log(`[SEED] ✅ Đã tạo xe: ${v.name} (Mã: ${v.code}${v.pin ? ' | PIN: ' + v.pin : ' | Không cần PIN'})`);
      } else {
        // Cập nhật PIN code nếu xe đã tồn tại
        await pool.request()
          .input('code', sql.NVarChar, v.code)
          .input('pin', sql.NVarChar, v.pin)
          .query('UPDATE vehicles SET pin_code = @pin WHERE vehicle_code = @code');
        console.log(`[SEED] ℹ️  Xe [${v.code}] đã tồn tại, đã đồng bộ PIN bảo mật.`);
      }

      // Liên kết với admin (role = owner)
      if (adminId && vehicleId) {
        const linkCheck = await pool.request()
          .input('user_id', sql.Int, adminId)
          .input('vehicle_id', sql.Int, vehicleId)
          .query('SELECT id FROM user_vehicles WHERE user_id = @user_id AND vehicle_id = @vehicle_id');

        if (linkCheck.recordset.length === 0) {
          await pool.request()
            .input('user_id', sql.Int, adminId)
            .input('vehicle_id', sql.Int, vehicleId)
            .query("INSERT INTO user_vehicles (user_id, vehicle_id, role) VALUES (@user_id, @vehicle_id, 'owner')");
          console.log(`[SEED] ✅ Đã liên kết admin ↔ ${v.name} (owner)`);
        }
      }
    }

    console.log('[SEED] ✅ Seed hoàn tất!');
    await closePool();
    process.exit(0);
  } catch (err) {
    console.error('[SEED] ❌ Lỗi seed:', err.message);
    await closePool();
    process.exit(1);
  }
}

seed();
