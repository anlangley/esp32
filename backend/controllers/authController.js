// ============================================================================
// AUTH CONTROLLER — Đăng ký, Đăng nhập, Lấy thông tin user, Đổi mật khẩu
// ============================================================================

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getPool, sql } from '../database/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12');

/**
 * POST /api/auth/register — Đăng ký tài khoản mới
 */
export async function register(req, res) {
  try {
    const { username, email, password, displayName } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Thiếu username, email hoặc password.' });
    }
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ success: false, message: 'Username phải từ 3-30 ký tự.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải ít nhất 6 ký tự.' });
    }
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Email không hợp lệ.' });
    }

    const pool = await getPool();

    // Kiểm tra username hoặc email đã tồn tại chưa
    const existing = await pool.request()
      .input('username', sql.NVarChar, username)
      .input('email', sql.NVarChar, email)
      .query('SELECT id FROM users WHERE username = @username OR email = @email');

    if (existing.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Username hoặc email đã được sử dụng.' });
    }

    // Hash mật khẩu
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert user mới
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .input('email', sql.NVarChar, email)
      .input('password_hash', sql.NVarChar, passwordHash)
      .input('display_name', sql.NVarChar, displayName || username)
      .query(`
        INSERT INTO users (username, email, password_hash, display_name)
        OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.display_name, INSERTED.role, INSERTED.created_at
        VALUES (@username, @email, @password_hash, @display_name)
      `);

    const newUser = result.recordset[0];
    console.log(`[AUTH] ✅ Đăng ký thành công: ${username}`);

    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công!',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.display_name,
        role: newUser.role,
      },
    });
  } catch (err) {
    console.error('[AUTH] ❌ Lỗi đăng ký:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
}

/**
 * POST /api/auth/login — Đăng nhập, trả JWT token
 */
export async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Thiếu username hoặc password.' });
    }

    const pool = await getPool();

    // Tìm user theo username
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query('SELECT * FROM users WHERE username = @username');

    if (result.recordset.length === 0) {
      return res.status(401).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu.' });
    }

    const user = result.recordset[0];

    // So sánh mật khẩu
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu.' });
    }

    // Tạo JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Cập nhật last_login
    await pool.request()
      .input('id', sql.Int, user.id)
      .query('UPDATE users SET last_login = GETDATE() WHERE id = @id');

    console.log(`[AUTH] ✅ Đăng nhập thành công: ${username} (role: ${user.role})`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[AUTH] ❌ Lỗi đăng nhập:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
}

/**
 * GET /api/auth/me — Lấy thông tin user hiện tại (cần JWT)
 */
export async function getMe(req, res) {
  try {
    const pool = await getPool();

    const result = await pool.request()
      .input('id', sql.Int, req.user.userId)
      .query(`
        SELECT u.id, u.username, u.email, u.display_name, u.role, u.created_at, u.last_login
        FROM users u
        WHERE u.id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const user = result.recordset[0];

    // Lấy danh sách xe đã liên kết
    const vehiclesResult = await pool.request()
      .input('user_id', sql.Int, req.user.userId)
      .query(`
        SELECT v.id, v.vehicle_code, v.name, v.description, v.status, uv.role AS user_role, uv.linked_at
        FROM user_vehicles uv
        JOIN vehicles v ON uv.vehicle_id = v.id
        WHERE uv.user_id = @user_id
      `);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        createdAt: user.created_at,
        lastLogin: user.last_login,
      },
      vehicles: vehiclesResult.recordset.map(v => ({
        id: v.id,
        vehicleCode: v.vehicle_code,
        name: v.name,
        description: v.description,
        status: v.status,
        userRole: v.user_role,
        linkedAt: v.linked_at,
      })),
    });
  } catch (err) {
    console.error('[AUTH] ❌ Lỗi getMe:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
}

/**
 * PUT /api/auth/password — Đổi mật khẩu (cần JWT)
 */
export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Thiếu mật khẩu hiện tại hoặc mật khẩu mới.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu mới phải ít nhất 6 ký tự.' });
    }

    const pool = await getPool();

    const result = await pool.request()
      .input('id', sql.Int, req.user.userId)
      .query('SELECT password_hash FROM users WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, result.recordset[0].password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Mật khẩu hiện tại không đúng.' });
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.request()
      .input('id', sql.Int, req.user.userId)
      .input('password_hash', sql.NVarChar, newHash)
      .query('UPDATE users SET password_hash = @password_hash WHERE id = @id');

    console.log(`[AUTH] ✅ Đổi mật khẩu thành công: ${req.user.username}`);
    res.json({ success: true, message: 'Đổi mật khẩu thành công.' });
  } catch (err) {
    console.error('[AUTH] ❌ Lỗi đổi mật khẩu:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
}
