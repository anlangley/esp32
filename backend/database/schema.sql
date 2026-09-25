-- ============================================================================
-- SQL SERVER DATABASE SCHEMA — IoT Car Authentication & Vehicle Management
-- Database: iotcar_db
-- ============================================================================

-- USE iotcar_db;
-- GO

-- 1. Bảng users: Lưu thông tin tài khoản người dùng
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
CREATE TABLE users (
  id INT IDENTITY(1,1) PRIMARY KEY,
  username NVARCHAR(100) NOT NULL UNIQUE,
  email NVARCHAR(255) NOT NULL UNIQUE,
  password_hash NVARCHAR(255) NOT NULL,
  display_name NVARCHAR(100),
  role NVARCHAR(20) NOT NULL DEFAULT 'user', -- 'admin' hoặc 'user'
  created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  last_login DATETIME2
);

-- 2. Bảng vehicles: Danh mục thiết bị xe ô tô IoT
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='vehicles' AND xtype='U')
CREATE TABLE vehicles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  vehicle_code NVARCHAR(50) NOT NULL UNIQUE, -- Mã xe dùng để chia sẻ / liên kết (vd: CAR-A1B2C3)
  name NVARCHAR(100),                         -- Tên thân thiện (vd: "Xe đua F1 Mini")
  description NVARCHAR(500),
  hardware_id NVARCHAR(50) UNIQUE,           -- MAC Address / Chip ID của ESP32
  status NVARCHAR(20) NOT NULL DEFAULT 'offline', -- 'online' / 'offline'
  created_at DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- 3. Bảng user_vehicles: Quan hệ N-N giữa người dùng và xe được quyền điều khiển
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_vehicles' AND xtype='U')
CREATE TABLE user_vehicles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL FOREIGN KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id INT NOT NULL FOREIGN KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  role NVARCHAR(20) NOT NULL DEFAULT 'driver', -- 'owner' hoặc 'driver'
  linked_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  UNIQUE(user_id, vehicle_id)
);

-- 4. Bảng sessions: Nhật ký các phiên điều khiển xe
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='sessions' AND xtype='U')
CREATE TABLE sessions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL FOREIGN KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id INT NOT NULL FOREIGN KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  started_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  ended_at DATETIME2,
  ip_address NVARCHAR(45)
);
