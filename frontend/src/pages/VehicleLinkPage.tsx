// ============================================================================
// VEHICLE LINK PAGE — Trang nhập mã xe để liên kết với tài khoản
// ============================================================================

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Car, Link2, LogOut, CheckCircle2, KeyRound } from 'lucide-react';

export function VehicleLinkPage() {
  const { user, linkVehicle, logout } = useAuth();
  const [vehicleCode, setVehicleCode] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [requiresPin, setRequiresPin] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDemo = vehicleCode.trim().toUpperCase() === 'CAR-A1B2C3';
  const showPinField = requiresPin || (!isDemo && vehicleCode.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await linkVehicle(vehicleCode.trim().toUpperCase(), pinCode.trim());
      if (!result.success) {
        setError(result.message || 'Liên kết xe thất bại.');
        if (result.requiresPin) {
          setRequiresPin(true);
        }
      }
      // Nếu thành công, AuthContext sẽ tự cập nhật vehicles và redirect
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
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-80 h-80 rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)' }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))',
              border: '1px solid rgba(59,130,246,0.2)',
              boxShadow: '0 0 30px rgba(59,130,246,0.1)',
            }}
          >
            <Car className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Liên Kết Xe</h1>
          <p className="text-gray-500 text-sm">
            Xin chào, <span className="text-cyan-400">{user?.displayName || user?.username}</span>!
          </p>
        </div>

        {/* Link Card */}
        <div className="glass-panel-neon rounded-2xl p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-blue-400" />
            Nhập Mã Xe
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Nhập mã xe được in trên thân xe hoặc do quản trị viên cung cấp để bắt đầu điều khiển.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Mã xe</label>
              <input
                id="input-vehicle-code"
                type="text"
                className="glass-input w-full text-center text-lg tracking-widest font-mono uppercase"
                placeholder="CAR-A1B2C3"
                value={vehicleCode}
                onChange={(e) => {
                  setVehicleCode(e.target.value.toUpperCase());
                  setError('');
                }}
                required
                autoFocus
                maxLength={20}
              />
            </div>

            {/* PIN field - Chỉ hiện khi nhập mã xe khác CAR-A1B2C3 hoặc server yêu cầu */}
            {showPinField && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="block text-xs font-medium text-cyan-400 mb-1.5 flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5" />
                  Mã PIN bảo mật (Bắt buộc với xe thật)
                </label>
                <input
                  id="input-vehicle-pin"
                  type="password"
                  className="glass-input w-full text-center text-lg tracking-widest font-mono"
                  placeholder="Nhập mã PIN phần cứng"
                  value={pinCode}
                  onChange={(e) => {
                    setPinCode(e.target.value);
                    setError('');
                  }}
                  required={showPinField}
                  maxLength={20}
                />
              </div>
            )}

            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              id="btn-link-vehicle"
              type="submit"
              disabled={isSubmitting || vehicleCode.trim().length === 0}
              className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                background: isSubmitting
                  ? 'rgba(59,130,246,0.1)'
                  : 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.1))',
                border: '1px solid rgba(59,130,246,0.3)',
                color: '#60a5fa',
                boxShadow: isSubmitting ? 'none' : '0 0 20px rgba(59,130,246,0.1)',
              }}
            >
              {isSubmitting ? 'Đang liên kết...' : <><CheckCircle2 className="w-4 h-4" /> Liên Kết Xe</>}
            </button>
          </form>
        </div>

        {/* Logout button */}
        <div className="mt-6 text-center">
          <button
            id="btn-logout"
            type="button"
            className="text-sm text-gray-600 hover:text-red-400 transition-colors flex items-center gap-1.5 mx-auto"
            onClick={logout}
          >
            <LogOut className="w-3.5 h-3.5" />
            Đăng xuất
          </button>
        </div>

        {/* Public Demo Hint */}
        <div className="text-center text-xs mt-4">
          <p className="text-gray-500">
            🎮 Trải nghiệm thử buồng lái Demo:{' '}
            <button
              type="button"
              onClick={() => {
                setVehicleCode('CAR-A1B2C3');
                setPinCode('');
                setRequiresPin(false);
                setError('');
              }}
              className="text-amber-400 font-mono font-bold hover:underline"
              title="Nhấn để điền mã xe demo (không cần PIN)"
            >
              CAR-A1B2C3
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
