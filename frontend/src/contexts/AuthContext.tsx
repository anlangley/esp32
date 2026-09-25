// ============================================================================
// AUTH CONTEXT — React Context quản lý auth state toàn ứng dụng
// ============================================================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  apiGetMe,
  apiLogin,
  apiRegister,
  apiLinkVehicle,
  apiUnlinkVehicle,
  getToken,
  setToken,
  removeToken,
} from '../services/authService';
import type { AuthUser, Vehicle } from '../services/authService';

interface AuthContextType {
  user: AuthUser | null;
  vehicles: Vehicle[];
  activeVehicle: Vehicle | null;
  setActiveVehicle: (vehicle: Vehicle | null) => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasVehicle: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (username: string, email: string, password: string, displayName?: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  linkVehicle: (vehicleCode: string, pinCode?: string) => Promise<{ success: boolean; message?: string; requiresPin?: boolean }>;
  unlinkVehicle: (vehicleId: number) => Promise<{ success: boolean; message?: string }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeVehicle, setActiveVehicleState] = useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Helper chọn xe đang kích hoạt: Ưu tiên lựa chọn đã lưu trong localStorage hoặc xe thật (nếu có liên kết)
  const syncActiveVehicle = useCallback((list: Vehicle[]) => {
    if (!list || list.length === 0) {
      setActiveVehicleState(null);
      return;
    }
    const savedCode = localStorage.getItem('active_vehicle_code');
    if (savedCode) {
      const found = list.find((v) => v.vehicleCode.toUpperCase() === savedCode.toUpperCase());
      if (found) {
        setActiveVehicleState(found);
        return;
      }
    }
    // Ưu tiên 1: Bất kỳ xe thật nào tài khoản đã liên kết
    const realCar = list.find((v) => v.vehicleCode.toUpperCase() !== 'CAR-A1B2C3');
    if (realCar) {
      setActiveVehicleState(realCar);
      localStorage.setItem('active_vehicle_code', realCar.vehicleCode);
      return;
    }
    // Ưu tiên 2: Xe demo ảo CAR-A1B2C3
    const demoCar = list.find((v) => v.vehicleCode.toUpperCase() === 'CAR-A1B2C3');
    if (demoCar) {
      setActiveVehicleState(demoCar);
      localStorage.setItem('active_vehicle_code', demoCar.vehicleCode);
      return;
    }
    // Mặc định xe đầu tiên
    setActiveVehicleState(list[0]);
    localStorage.setItem('active_vehicle_code', list[0].vehicleCode);
  }, []);

  const setActiveVehicle = useCallback((v: Vehicle | null) => {
    setActiveVehicleState(v);
    if (v) {
      localStorage.setItem('active_vehicle_code', v.vehicleCode);
    } else {
      localStorage.removeItem('active_vehicle_code');
    }
  }, []);

  // Kiểm tra token khi app khởi động
  useEffect(() => {
    const token = getToken();
    if (token) {
      apiGetMe()
        .then((data) => {
          if (data.success && data.user) {
            setUser(data.user);
            const vList = data.vehicles || [];
            setVehicles(vList);
            syncActiveVehicle(vList);
          } else {
            removeToken();
          }
        })
        .catch(() => {
          removeToken();
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [syncActiveVehicle]);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiGetMe();
      if (data.success && data.user) {
        setUser(data.user);
        const vList = data.vehicles || [];
        setVehicles(vList);
        syncActiveVehicle(vList);
      }
    } catch {
      // ignore
    }
  }, [syncActiveVehicle]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiLogin(username, password);
    if (data.success && data.token && data.user) {
      setToken(data.token);
      setUser(data.user);
      // Fetch vehicles sau khi login
      try {
        const meData = await apiGetMe();
        if (meData.vehicles) {
          setVehicles(meData.vehicles);
          syncActiveVehicle(meData.vehicles);
        }
      } catch {
        // ignore
      }
      return { success: true };
    }
    return { success: false, message: data.message || 'Đăng nhập thất bại.' };
  }, [syncActiveVehicle]);

  const register = useCallback(async (username: string, email: string, password: string, displayName?: string) => {
    const data = await apiRegister(username, email, password, displayName);
    if (data.success) {
      return { success: true };
    }
    return { success: false, message: data.message || 'Đăng ký thất bại.' };
  }, []);

  const logout = useCallback(() => {
    removeToken();
    localStorage.removeItem('active_vehicle_code');
    setUser(null);
    setVehicles([]);
    setActiveVehicleState(null);
  }, []);

  const linkVehicle = useCallback(async (vehicleCode: string, pinCode?: string) => {
    const data = await apiLinkVehicle(vehicleCode, pinCode);
    if (data.success) {
      await refreshUser();
      return { success: true, message: data.message };
    }
    return { success: false, message: data.message || 'Liên kết xe thất bại.', requiresPin: data.requiresPin };
  }, [refreshUser]);

  const unlinkVehicle = useCallback(async (vehicleId: number) => {
    try {
      const data = await apiUnlinkVehicle(vehicleId);
      if (data.success) {
        await refreshUser();
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || 'Hủy liên kết xe thất bại.' };
    } catch {
      return { success: false, message: 'Lỗi mạng khi hủy liên kết xe.' };
    }
  }, [refreshUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        vehicles,
        activeVehicle,
        setActiveVehicle,
        isLoading,
        isAuthenticated: !!user,
        hasVehicle: vehicles.length > 0,
        login,
        register,
        logout,
        linkVehicle,
        unlinkVehicle,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được dùng bên trong AuthProvider');
  }
  return context;
}
