import {
  AvailabilityResponse,
  BookingConfirmation,
  ServiceItem,
  Staff,
  ApiError,
  Appointment,
  ClientRow,
  StatsResponse,
  NotificationsResponse,
} from "../types";

const BASE = "/api";
const ADMIN_TOKEN_KEY = "salon_admin_token";
const CLIENT_TOKEN_KEY = "rayen_client_token";

class ApiRequestError extends Error {
  code: string;
  constructor(err: ApiError) {
    super(err.message);
    this.code = err.error;
  }
}

async function request<T>(path: string, options: RequestInit = {}, admin = false, tokenKey?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (admin) {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } else if (tokenKey) {
    const token = localStorage.getItem(tokenKey);
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new ApiRequestError(data || { error: "UNKNOWN", message: "Erreur inconnue." });
  }
  return data as T;
}

// ---------- Public ----------
export const getStaff = () => request<Staff[]>("/staff");
export const getServices = () => request<ServiceItem[]>("/services");

export const getAvailability = (staffId: number, serviceId: number, date: string) =>
  request<AvailabilityResponse>(
    `/availability?staffId=${staffId}&serviceId=${serviceId}&date=${date}`
  );

export const createBooking = (payload: {
  staffId: number;
  serviceId: number;
  date: string;
  time: string;
  clientName: string;
  clientPhone: string;
}) =>
  request<BookingConfirmation>("/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  }, false, CLIENT_TOKEN_KEY);

// ---------- Client account ----------
export const clientRegister = async (payload: { name: string; phone: string; email: string; password: string }) => {
  const res = await request<{ token: string; client: import("../types").ClientAccount }>("/client-auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  localStorage.setItem(CLIENT_TOKEN_KEY, res.token);
  return res;
};

export const clientLogin = async (identifier: string, password: string) => {
  const res = await request<{ token: string; client: import("../types").ClientAccount }>("/client-auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
  localStorage.setItem(CLIENT_TOKEN_KEY, res.token);
  return res;
};

export const clientLogout = () => localStorage.removeItem(CLIENT_TOKEN_KEY);
export const isClientAuthed = () => !!localStorage.getItem(CLIENT_TOKEN_KEY);

export const clientGetMe = () => request<{ client: import("../types").ClientAccount }>("/client-auth/me", {}, false, CLIENT_TOKEN_KEY);
export const clientGetAppointments = () => request<{ appointments: Appointment[] }>("/client-auth/me/appointments", {}, false, CLIENT_TOKEN_KEY);
export const clientUpdateProfile = (payload: { name: string; phone: string; email: string }) =>
  request<{ client: import("../types").ClientAccount }>("/client-auth/me", { method: "PUT", body: JSON.stringify(payload) }, false, CLIENT_TOKEN_KEY);

// ---------- Admin ----------
export const adminLogin = async (password: string) => {
  const res = await request<{ token: string }>("/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
  return res;
};

export const adminLogout = () => localStorage.removeItem(ADMIN_TOKEN_KEY);
export const isAdminAuthed = () => !!localStorage.getItem(ADMIN_TOKEN_KEY);

export const adminGetAppointments = (
  params: { date?: string; staffId?: number; status?: string } = {}
) => {
  const qs = new URLSearchParams();
  if (params.date) qs.set("date", params.date);
  if (params.staffId) qs.set("staffId", String(params.staffId));
  if (params.status) qs.set("status", params.status);
  return request<Appointment[]>(`/admin/appointments?${qs.toString()}`, {}, true);
};

export const adminCreateAppointment = (payload: Record<string, unknown>) =>
  request<Appointment>("/admin/appointments", { method: "POST", body: JSON.stringify(payload) }, true);

export const adminUpdateAppointment = (id: string, payload: Record<string, unknown>) =>
  request<Appointment>(`/admin/appointments/${id}`, { method: "PUT", body: JSON.stringify(payload) }, true);

export const adminCancelAppointment = (id: string) =>
  request<{ ok: boolean }>(`/admin/appointments/${id}`, { method: "DELETE" }, true);

export const adminGetServices = () => request<ServiceItem[]>("/admin/services", {}, true);
export const adminCreateService = (payload: Record<string, unknown>) =>
  request<ServiceItem>("/admin/services", { method: "POST", body: JSON.stringify(payload) }, true);
export const adminUpdateService = (id: number, payload: Record<string, unknown>) =>
  request<ServiceItem>(`/admin/services/${id}`, { method: "PUT", body: JSON.stringify(payload) }, true);

export const adminGetStaff = () => request<Staff[]>("/admin/staff", {}, true);
export const adminUpdateStaff = (id: number, payload: Record<string, unknown>) =>
  request<Staff>(`/admin/staff/${id}`, { method: "PUT", body: JSON.stringify(payload) }, true);

export const adminGetClients = (search?: string) =>
  request<ClientRow[]>(`/admin/clients${search ? `?search=${encodeURIComponent(search)}` : ""}`, {}, true);

export const adminGetClientAppointments = (phone: string) =>
  request<Appointment[]>(`/admin/clients/${encodeURIComponent(phone)}/appointments`, {}, true);

export const adminGetStats = (from?: string, to?: string) => {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  return request<StatsResponse>(`/admin/stats?${qs.toString()}`, {}, true);
};

// ---------- Admin: Notifications ----------
export const adminGetNotifications = (limit = 50) =>
  request<NotificationsResponse>(`/admin/notifications?limit=${limit}`, {}, true);

export const adminMarkNotificationRead = (id: string) =>
  request<{ ok: boolean }>(`/admin/notifications/${id}/read`, { method: "POST" }, true);

export const adminMarkAllNotificationsRead = () =>
  request<{ ok: boolean }>(`/admin/notifications/mark-all-read`, { method: "POST" }, true);

export { ApiRequestError };