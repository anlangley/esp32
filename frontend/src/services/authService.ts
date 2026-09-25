// ============================================================================
// AUTH SERVICE — API calls cho login, register, getMe, linkVehicle
// ============================================================================

const API_BASE = `http://${window.location.hostname}:3000/api`;

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  displayName: string;
  role: string;
}

export interface Vehicle {
  id: number;
  vehicleCode: string;
  name: string;
  description: string;
  status: string;
  userRole?: string;
  linkedAt?: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: AuthUser;
  message?: string;
}

export interface MeResponse {
  success: boolean;
  user?: AuthUser;
  vehicles?: Vehicle[];
  message?: string;
}

// ==================== TOKEN MANAGEMENT ====================

export function getToken(): string | null {
  return localStorage.getItem('jwt_token');
}

export function setToken(token: string) {
  localStorage.setItem('jwt_token', token);
}

export function removeToken() {
  localStorage.removeItem('jwt_token');
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ==================== API CALLS ====================

export async function apiLogin(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

export async function apiRegister(
  username: string,
  email: string,
  password: string,
  displayName?: string
): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password, displayName }),
  });
  return res.json();
}

export async function apiGetMe(): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: authHeaders(),
  });
  if (res.status === 401) {
    removeToken();
    throw new Error('Token hết hạn');
  }
  return res.json();
}

export async function apiLinkVehicle(vehicleCode: string, pinCode?: string): Promise<{ success: boolean; message?: string; requiresPin?: boolean }> {
  const res = await fetch(`${API_BASE}/vehicles/link`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ vehicleCode, pinCode }),
  });
  return res.json();
}

export async function apiGetMyVehicles() {
  const res = await fetch(`${API_BASE}/vehicles/my`, {
    headers: authHeaders(),
  });
  return res.json();
}

export async function apiUnlinkVehicle(vehicleId: number) {
  const res = await fetch(`${API_BASE}/vehicles/unlink/${vehicleId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return res.json();
}
