// ============================================================================
// DATABASE CONNECTION — SQL Server (mssql) Connection Pool
// Khởi tạo kết nối SQL Server và tự động tạo bảng nếu chưa có
// ============================================================================

import sql from 'mssql';
import 'dotenv/config';

const config = {
  server: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '1433'),
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '123',
  database: process.env.DB_NAME || 'iotcar_db',
  options: {
    encrypt: false,              // Không mã hóa cho local dev
    trustServerCertificate: true, // Bỏ qua SSL certificate cho local
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

/**
 * Lấy connection pool đã kết nối. 
 * Gọi hàm này mỗi khi cần truy vấn DB.
 */
export async function getPool() {
  if (pool) return pool;

  try {
    pool = await sql.connect(config);
    console.log(`[DB] ✅ Đã kết nối SQL Server: ${config.server}:${config.port}/${config.database}`);
    await initializeSchema();
    return pool;
  } catch (err) {
    console.error('[DB] ❌ Lỗi kết nối SQL Server:', err.message);
    throw err;
  }
}

/**
 * Tự động tạo bảng nếu chưa tồn tại.
 */
async function initializeSchema() {
  const schemaSQL = `
    -- Bảng users
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
    CREATE TABLE users (
      id INT IDENTITY(1,1) PRIMARY KEY,
      username NVARCHAR(100) NOT NULL UNIQUE,
      email NVARCHAR(255) NOT NULL UNIQUE,
      password_hash NVARCHAR(255) NOT NULL,
      display_name NVARCHAR(100),
      role NVARCHAR(20) NOT NULL DEFAULT 'user',
      created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
      last_login DATETIME2
    );

    -- Bảng vehicles
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='vehicles' AND xtype='U')
    CREATE TABLE vehicles (
      id INT IDENTITY(1,1) PRIMARY KEY,
      vehicle_code NVARCHAR(50) NOT NULL UNIQUE,
      name NVARCHAR(100),
      description NVARCHAR(500),
      hardware_id NVARCHAR(50) UNIQUE,
      status NVARCHAR(20) NOT NULL DEFAULT 'offline',
      created_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );

    -- Bảng user_vehicles (quan hệ N-N)
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_vehicles' AND xtype='U')
    CREATE TABLE user_vehicles (
      id INT IDENTITY(1,1) PRIMARY KEY,
      user_id INT NOT NULL FOREIGN KEY REFERENCES users(id) ON DELETE CASCADE,
      vehicle_id INT NOT NULL FOREIGN KEY REFERENCES vehicles(id) ON DELETE CASCADE,
      role NVARCHAR(20) NOT NULL DEFAULT 'driver',
      linked_at DATETIME2 NOT NULL DEFAULT GETDATE(),
      UNIQUE(user_id, vehicle_id)
    );

    -- Bảng sessions (lịch sử phiên điều khiển)
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='sessions' AND xtype='U')
    CREATE TABLE sessions (
      id INT IDENTITY(1,1) PRIMARY KEY,
      user_id INT NOT NULL FOREIGN KEY REFERENCES users(id) ON DELETE CASCADE,
      vehicle_id INT NOT NULL FOREIGN KEY REFERENCES vehicles(id) ON DELETE CASCADE,
      started_at DATETIME2 NOT NULL DEFAULT GETDATE(),
      ended_at DATETIME2,
      ip_address NVARCHAR(45)
    );

    -- Cột pin_code trong bảng vehicles cho xe thật
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('vehicles') AND name = 'pin_code')
    BEGIN
      ALTER TABLE vehicles ADD pin_code NVARCHAR(50) NULL;
    END
  `;

  try {
    await pool.request().query(schemaSQL);
    console.log('[DB] ✅ Schema đã được khởi tạo (các bảng users, vehicles, user_vehicles, sessions).');
  } catch (err) {
    console.error('[DB] ❌ Lỗi khởi tạo schema:', err.message);
    throw err;
  }
}

/**
 * Đóng connection pool (dùng khi shutdown).
 */
export async function closePool() {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('[DB] Đã đóng connection pool.');
  }
}

export { sql };
