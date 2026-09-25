// ============================================================================
// LOGIN PAGE — Trang đăng nhập với chuyển đổi sang đăng ký
// ============================================================================

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, UserPlus, Eye, EyeOff, Wifi, Shield } from 'lucide-react';

export function LoginPage() {
  const { login, register } = useAuth();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      if (isRegisterMode) {
        const result = await register(username, email, password, displayName);
        if (result.success) {
          setSuccess('Đăng ký thành công! Hãy đăng nhập.');
          setIsRegisterMode(false);
          setPassword('');
        } else {
          setError(result.message || 'Đăng ký thất bại.');
        }
      } else {
        const result = await login(username, password);
        if (!result.success) {
          setError(result.message || 'Đăng nhập thất bại.');
        }
      }
    } catch {
      setError('Không thể kết nối đến server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'linear-gradient(135deg, #07080d 0%, #0d1117 50%, #07080d 100%)',
      }}
    >
      {/* Ambient glow effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #00f0ff, transparent 70%)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #ff003c, transparent 70%)' }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, rgba(0,240,255,0.15), rgba(0,240,255,0.05))',
              border: '1px solid rgba(0,240,255,0.2)',
              boxShadow: '0 0 30px rgba(0,240,255,0.1)',
            }}
          >
            <Shield className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">IoT Car Dashboard</h1>
          <p className="text-gray-500 text-sm flex items-center justify-center gap-1.5">
            <Wifi className="w-3.5 h-3.5" />
            Hệ thống điều khiển xe ESP32
          </p>
        </div>

        {/* Form Card */}
        <div className="glass-panel-neon rounded-2xl p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            {isRegisterMode ? (
              <><UserPlus className="w-5 h-5 text-cyan-400" /> Đăng Ký Tài Khoản</>
            ) : (
              <><LogIn className="w-5 h-5 text-cyan-400" /> Đăng Nhập</>
            )}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Tên đăng nhập</label>
              <input
                id="input-username"
                type="text"
                className="glass-input w-full"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
              />
            </div>

            {/* Email (chỉ hiện khi đăng ký) */}
            {isRegisterMode && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
                  <input
                    id="input-email"
                    type="email"
                    className="glass-input w-full"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Tên hiển thị</label>
                  <input
                    id="input-display-name"
                    type="text"
                    className="glass-input w-full"
                    placeholder="Tên của bạn"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              </>
            )}

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Mật khẩu</label>
              <div className="relative">
                <input
                  id="input-password"
                  type={showPassword ? 'text' : 'password'}
                  className="glass-input w-full pr-10"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error / Success Messages */}
            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            {success && (
              <div className="text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                {success}
              </div>
            )}

            {/* Submit Button */}
            <button
              id="btn-auth-submit"
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50"
              style={{
                background: isSubmitting
                  ? 'rgba(0,240,255,0.1)'
                  : 'linear-gradient(135deg, rgba(0,240,255,0.2), rgba(0,240,255,0.1))',
                border: '1px solid rgba(0,240,255,0.3)',
                color: '#00f0ff',
                boxShadow: isSubmitting ? 'none' : '0 0 20px rgba(0,240,255,0.1)',
              }}
            >
              {isSubmitting ? 'Đang xử lý...' : isRegisterMode ? 'Đăng Ký' : 'Đăng Nhập'}
            </button>
          </form>

          {/* Toggle login/register */}
          <div className="mt-5 text-center">
            <button
              id="btn-toggle-auth-mode"
              type="button"
              className="text-sm text-gray-500 hover:text-cyan-400 transition-colors"
              onClick={() => {
                setIsRegisterMode(!isRegisterMode);
                setError('');
                setSuccess('');
              }}
            >
              {isRegisterMode
                ? 'Đã có tài khoản? Đăng nhập'
                : 'Chưa có tài khoản? Đăng ký ngay'}
            </button>
          </div>
        </div>

        {/* Footer hint */}
        <p className="text-center text-gray-600 text-xs mt-6">
          Tài khoản mặc định: <span className="text-gray-400">admin</span> / <span className="text-gray-400">admin123</span>
        </p>
      </div>
    </div>
  );
}
