// ============================================================================
// PROTECTED ROUTE — Bảo vệ các trang yêu cầu đăng nhập và liên kết xe
// ============================================================================

import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LoginPage } from '../pages/LoginPage';
import { VehicleLinkPage } from '../pages/VehicleLinkPage';
import { ShieldCheck, Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireVehicle?: boolean;
}

export function ProtectedRoute({ children, requireVehicle = true }: ProtectedRouteProps) {
  const { isAuthenticated, hasVehicle, isLoading } = useAuth();

  // Đang kiểm tra token / trạng thái user
  if (isLoading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center space-y-4"
        style={{
          background: 'linear-gradient(135deg, #07080d 0%, #0d1117 50%, #07080d 100%)',
        }}
      >
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-cyan-500/10 border border-cyan-500/20 shadow-[0_0_30px_rgba(0,240,255,0.2)]">
            <ShieldCheck className="w-8 h-8 text-cyan-400 animate-pulse" />
          </div>
          <Loader2 className="w-6 h-6 text-cyan-400 animate-spin absolute -bottom-2 -right-2" />
        </div>
        <p className="text-gray-400 text-sm font-mono tracking-wider animate-pulse">
          ĐANG XÁC THỰC BẢO MẬT HỆ THỐNG...
        </p>
      </div>
    );
  }

  // Chưa đăng nhập → Hiển thị trang Login
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Đã đăng nhập nhưng chưa liên kết xe (và trang yêu cầu xe) → Hiển thị trang nhập mã xe
  if (requireVehicle && !hasVehicle) {
    return <VehicleLinkPage />;
  }

  // Đã thỏa mãn mọi điều kiện
  return <>{children}</>;
}
