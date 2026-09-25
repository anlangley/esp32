// ============================================================================
// VEHICLE MODAL — Quản lý và liên kết danh sách xe ô tô IoT
// ============================================================================

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { X, Car, Plus, CheckCircle, ShieldCheck, Gamepad2, Radio, Trash2, Loader2 } from 'lucide-react';

interface VehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VehicleModal({ isOpen, onClose }: VehicleModalProps) {
  const { user, vehicles, activeVehicle, setActiveVehicle, linkVehicle, unlinkVehicle, refreshUser } = useAuth();
  const [newCode, setNewCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  if (!isOpen) return null;

  const isDemo = newCode.trim().toUpperCase() === 'CAR-A1B2C3';
  const showPin = !isDemo && newCode.trim().length > 0;

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) return;
    setIsLinking(true);
    setMsg(null);

    try {
      const res = await linkVehicle(newCode.trim().toUpperCase(), newPin.trim());
      if (res.success) {
        setMsg({ text: res.message || 'Liên kết xe thành công!', type: 'success' });
        setNewCode('');
        setNewPin('');
        await refreshUser();
      } else {
        setMsg({ text: res.message || 'Liên kết thất bại.', type: 'error' });
      }
    } catch {
      setMsg({ text: 'Lỗi kết nối server.', type: 'error' });
    } finally {
      setIsLinking(false);
    }
  };

  const handleDelete = async (vehicleId: number, vehicleName: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa xe "${vehicleName}" khỏi danh sách xe đã lưu không?`)) {
      return;
    }
    setDeletingId(vehicleId);
    setMsg(null);

    try {
      const res = await unlinkVehicle(vehicleId);
      if (res.success) {
        setMsg({ text: `Đã xóa xe "${vehicleName}" thành công!`, type: 'success' });
      } else {
        setMsg({ text: res.message || 'Xóa xe thất bại.', type: 'error' });
      }
    } catch {
      setMsg({ text: 'Lỗi kết nối khi xóa xe.', type: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel-neon w-full max-w-lg rounded-2xl p-6 relative border border-cyber-neonBlue/30 shadow-[0_0_30px_rgba(0,240,255,0.15)] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white uppercase tracking-wider">Danh Sách Xe Của Bạn</h2>
              <p className="text-xs text-gray-400 font-mono">Tài khoản: {user?.displayName || user?.username} ({user?.role})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Explain Notice */}
        <div className="mb-4 p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-xs text-gray-300 space-y-1">
          <div className="flex items-center gap-1.5 text-cyan-300 font-semibold">
            <Radio className="w-3.5 h-3.5" />
            <span>Chế độ buồng lái:</span>
          </div>
          <p className="text-[11px] text-gray-400 pl-5">
            • <strong className="text-amber-400">Xe Demo Mô Phỏng</strong> (Mã: <code className="text-amber-300 font-mono">CAR-A1B2C3</code>): Dùng để trải nghiệm buồng lái ảo 2D, không tác động xe thật.
          </p>
          <p className="text-[11px] text-gray-400 pl-5">
            • <strong className="text-cyan-400">Xe Thật Phần Cứng</strong>: Cần mã bảo mật xe thật do chủ xe hoặc quản trị viên cung cấp để điều khiển động cơ thực tế.
          </p>
        </div>

        {/* Notice / Feedback Message */}
        {msg && (
          <div className={`mb-3 px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all ${
            msg.type === 'success' 
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' 
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}>
            <span>{msg.text}</span>
            <button type="button" onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100 ml-2 font-bold">×</button>
          </div>
        )}

        {/* Vehicle List */}
        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 mb-5">
          {vehicles.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm font-mono">
              Chưa có xe nào được liên kết.
            </div>
          ) : (
            vehicles.map((v) => {
              const isCurrent = activeVehicle?.id === v.id || activeVehicle?.vehicleCode === v.vehicleCode;
              const isRealHardware = v.vehicleCode.toUpperCase() !== 'CAR-A1B2C3';

              return (
                <div
                  key={v.id}
                  className={`flex items-center justify-between p-3 rounded-xl transition-all border ${
                    isCurrent
                      ? isRealHardware
                        ? 'bg-cyan-500/10 border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                        : 'bg-amber-500/10 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                      : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs ${
                      isRealHardware 
                        ? 'bg-cyan-400/20 border border-cyan-400/40 text-cyan-300' 
                        : 'bg-amber-400/20 border border-amber-400/40 text-amber-300'
                    }`}>
                      {isRealHardware ? <Radio className="w-4 h-4" /> : <Gamepad2 className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-2">
                        {v.name || (isRealHardware ? 'Xe Thật ESP32' : 'Xe Demo Ảo')}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                          isRealHardware
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {isRealHardware ? (user?.role === 'admin' ? v.vehicleCode : 'XE THẬT') : v.vehicleCode}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-gray-400" />
                          {isRealHardware ? 'Xe Thật Phần Cứng' : 'Mô Phỏng 2D'}
                        </span>
                        {isRealHardware && v.status && (
                          <span className={`text-[10px] px-1 rounded ${v.status === 'online' ? 'text-green-400 bg-green-500/10' : 'text-gray-500'}`}>
                            ● {v.status === 'online' ? 'ESP32 Online' : 'ESP32 Offline'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions: Select + Delete */}
                  <div className="flex items-center space-x-2 shrink-0">
                    {isCurrent ? (
                      <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                        isRealHardware ? 'text-cyan-400 bg-cyan-400/10' : 'text-amber-400 bg-amber-400/10'
                      }`}>
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Đang chọn</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveVehicle(v)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-300 bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
                      >
                        Chọn xe này
                      </button>
                    )}

                    {/* Nút Xóa xe đã lưu */}
                    <button
                      type="button"
                      onClick={() => handleDelete(v.id, v.name || v.vehicleCode)}
                      disabled={deletingId === v.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 border border-white/5 hover:border-red-500/30 transition-all disabled:opacity-50"
                      title={`Xóa "${v.name || v.vehicleCode}" khỏi danh sách đã lưu`}
                    >
                      {deletingId === v.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Link New Vehicle Form */}
        <form onSubmit={handleLink} className="space-y-3 pt-3 border-t border-white/10">
          <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Liên Kết Thêm Xe Mới
          </label>
          <div className="space-y-2">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newCode}
                onChange={(e) => {
                  setNewCode(e.target.value.toUpperCase());
                  setMsg(null);
                }}
                placeholder="Nhập mã xe (vd: CAR-A1B2C3)"
                className="glass-input flex-1 uppercase font-mono tracking-widest text-sm"
                maxLength={20}
              />
              <button
                type="submit"
                disabled={isLinking || !newCode.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all duration-200 disabled:opacity-50 flex items-center space-x-1.5"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,240,255,0.2), rgba(0,240,255,0.1))',
                  border: '1px solid rgba(0,240,255,0.3)',
                  color: '#00f0ff',
                }}
              >
                <Plus className="w-4 h-4" />
                <span>{isLinking ? '...' : 'Liên kết'}</span>
              </button>
            </div>

            {/* PIN field cho xe thật */}
            {showPin && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-150">
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => {
                    setNewPin(e.target.value);
                    setMsg(null);
                  }}
                  placeholder="Nhập mã PIN bảo mật phần cứng (Bắt buộc cho xe thật)"
                  className="glass-input w-full font-mono text-xs text-center"
                  maxLength={20}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-gray-500 font-mono pt-1">
            <span>Gợi ý demo:</span>
            <button
              type="button"
              onClick={() => {
                setNewCode('CAR-A1B2C3');
                setNewPin('');
                setMsg(null);
              }}
              className="text-amber-400 hover:underline"
            >
              🎮 CAR-A1B2C3 (Xe Demo Mô Phỏng - Không cần PIN)
            </button>
          </div>

          {msg && (
            <p className={`text-xs ${msg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
              {msg.text}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
