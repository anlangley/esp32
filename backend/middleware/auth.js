// ============================================================================
// JWT AUTH MIDDLEWARE — Xác thực JWT Token cho REST API
// Chặn mọi request không có token hoặc token không hợp lệ
// ============================================================================

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production';

/**
 * Middleware xác thực JWT cho Express routes.
 * Đọc token từ header: Authorization: Bearer <token>
 * Nếu hợp lệ → gắn req.user = { userId, role }
 * Nếu không → trả 401
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ success: false, message: 'Chưa cung cấp token xác thực.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, username, role, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token đã hết hạn. Vui lòng đăng nhập lại.' });
    }
    return res.status(401).json({ success: false, message: 'Token không hợp lệ.' });
  }
}

/**
 * Middleware kiểm tra quyền admin.
 * Phải dùng sau authenticateToken.
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này.' });
  }
  next();
}
