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
  BookingSettings,
} from "../types";

const BASE = "/api";

const ADMIN_TOKEN_KEY = "salon_admin_token";
const CLIENT_TOKEN_KEY = "rayen_client_token";

class ApiRequestError extends Error {
  code: string;

  constructor(err: ApiError) {
    super(err.message);
    this.name = "ApiRequestError";
    this.code = err.error;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  admin = false,
  tokenKey?: string
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (admin) {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } else if (tokenKey) {
    const token = localStorage.getItem(tokenKey);

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  const contentType =
    response.headers.get("content-type") || "";

  const isJson = contentType.includes("application/json");

  let data: unknown = null;

  if (isJson) {
    data = await response.json();
  }

  if (!response.ok) {
    const errorData: ApiError =
      data &&
      typeof data === "object" &&
      "error" in data &&
      "message" in data
        ? (data as ApiError)
        : {
            error: "UNKNOWN",
            message: "Erreur inconnue.",
          };

    throw new ApiRequestError(errorData);
  }

  return data as T;
}

/* =========================================================
   PUBLIC
   ========================================================= */

export const getStaff = () =>
  request<Staff[]>("/staff");

export const getServices = () =>
  request<ServiceItem[]>("/services");

export const getAvailability = (
  staffId: number,
  serviceId: number,
  date: string
) =>
  request<AvailabilityResponse>(
    `/availability?staffId=${staffId}&serviceId=${serviceId}&date=${encodeURIComponent(
      date
    )}`
  );

export const getBookingSettings = () =>
  request<BookingSettings>("/booking-settings");

export const createBooking = (payload: {
  staffId: number;
  serviceId: number;
  date: string;
  time: string;
  clientName: string;
  clientPhone: string;
}) =>
  request<BookingConfirmation>(
    "/bookings",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    false,
    CLIENT_TOKEN_KEY
  );

/* =========================================================
   CLIENT ACCOUNT
   ========================================================= */

export const clientRegister = async (payload: {
  name: string;
  phone: string;
  email?: string;
  password: string;
}) => {
  const response = await request<{
    token: string;
    client: import("../types").ClientAccount;
  }>("/client-auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      phone: payload.phone,
      ...(payload.email
        ? { email: payload.email }
        : {}),
      password: payload.password,
    }),
  });

  localStorage.setItem(
    CLIENT_TOKEN_KEY,
    response.token
  );

  return response;
};

export const clientLogin = async (
  identifier: string,
  password: string
) => {
  const response = await request<{
    token: string;
    client: import("../types").ClientAccount;
  }>("/client-auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier,
      password,
    }),
  });

  localStorage.setItem(
    CLIENT_TOKEN_KEY,
    response.token
  );

  return response;
};

export const clientLogout = () => {
  localStorage.removeItem(CLIENT_TOKEN_KEY);
};

export const isClientAuthed = () => {
  return !!localStorage.getItem(CLIENT_TOKEN_KEY);
};

export const clientGetMe = () =>
  request<{
    client: import("../types").ClientAccount;
  }>(
    "/client-auth/me",
    {},
    false,
    CLIENT_TOKEN_KEY
  );

export const clientGetAppointments = () =>
  request<{
    appointments: Appointment[];
  }>(
    "/client-auth/me/appointments",
    {},
    false,
    CLIENT_TOKEN_KEY
  );

export const clientGetAppointment = (
  id: string
) =>
  request<{
    appointment: Appointment;
  }>(
    `/client-auth/me/appointments/${encodeURIComponent(
      id
    )}`,
    {},
    false,
    CLIENT_TOKEN_KEY
  );

export const clientGetAppointmentAvailability = (
  id: string,
  staffId: number,
  serviceId: number,
  date: string
) =>
  request<AvailabilityResponse>(
    `/client-auth/me/appointments/${encodeURIComponent(
      id
    )}/availability?staffId=${staffId}&serviceId=${serviceId}&date=${encodeURIComponent(
      date
    )}`,
    {},
    false,
    CLIENT_TOKEN_KEY
  );

export const clientUpdateAppointment = (
  id: string,
  payload: {
    staffId?: number;
    serviceId?: number;
    date?: string;
    time?: string;
  }
) =>
  request<{
    appointment: Appointment;
  }>(
    `/client-auth/me/appointments/${encodeURIComponent(
      id
    )}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    false,
    CLIENT_TOKEN_KEY
  );

export const clientCancelAppointment = (
  id: string
) =>
  request<{
    success: boolean;
    message: string;
  }>(
    `/client-auth/me/appointments/${encodeURIComponent(
      id
    )}`,
    {
      method: "DELETE",
    },
    false,
    CLIENT_TOKEN_KEY
  );

export const clientUpdateProfile = (payload: {
  name: string;
  phone: string;
  email?: string;
}) =>
  request<{
    client: import("../types").ClientAccount;
  }>(
    "/client-auth/me",
    {
      method: "PUT",
      body: JSON.stringify({
        name: payload.name,
        phone: payload.phone,
        ...(payload.email
          ? { email: payload.email }
          : {}),
      }),
    },
    false,
    CLIENT_TOKEN_KEY
  );

/* =========================================================
   ADMIN AUTHENTICATION
   ========================================================= */

export const adminLogin = async (
  password: string
) => {
  const response = await request<{
    token: string;
  }>("/admin/login", {
    method: "POST",
    body: JSON.stringify({
      password,
    }),
  });

  localStorage.setItem(
    ADMIN_TOKEN_KEY,
    response.token
  );

  return response;
};

export const adminLogout = () => {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
};

export const isAdminAuthed = () => {
  return !!localStorage.getItem(ADMIN_TOKEN_KEY);
};

/* =========================================================
   ADMIN - APPOINTMENTS
   ========================================================= */

export const adminGetAppointments = (
  params: {
    date?: string;
    staffId?: number;
    status?: string;
  } = {}
) => {
  const query = new URLSearchParams();

  if (params.date) {
    query.set("date", params.date);
  }

  if (params.staffId !== undefined) {
    query.set(
      "staffId",
      String(params.staffId)
    );
  }

  if (params.status) {
    query.set("status", params.status);
  }

  const queryString = query.toString();

  return request<Appointment[]>(
    `/admin/appointments${
      queryString ? `?${queryString}` : ""
    }`,
    {},
    true
  );
};

export const adminCreateAppointment = (
  payload: Record<string, unknown>
) =>
  request<Appointment>(
    "/admin/appointments",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    true
  );

export const adminUpdateAppointment = (
  id: string,
  payload: Record<string, unknown>
) =>
  request<Appointment>(
    `/admin/appointments/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    true
  );

export const adminCancelAppointment = (
  id: string
) =>
  request<{ ok: boolean }>(
    `/admin/appointments/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
    true
  );

/* =========================================================
   ADMIN - SERVICES
   ========================================================= */

export const adminGetServices = () =>
  request<ServiceItem[]>(
    "/admin/services",
    {},
    true
  );

export const adminCreateService = (
  payload: Record<string, unknown>
) =>
  request<ServiceItem>(
    "/admin/services",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    true
  );

export const adminUpdateService = (
  id: number,
  payload: Record<string, unknown>
) =>
  request<ServiceItem>(
    `/admin/services/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    true
  );

/* =========================================================
   ADMIN - STAFF
   ========================================================= */

export const adminGetStaff = () =>
  request<Staff[]>(
    "/admin/staff",
    {},
    true
  );

export const adminUpdateStaff = (
  id: number,
  payload: Record<string, unknown>
) =>
  request<Staff>(
    `/admin/staff/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    true
  );

/* =========================================================
   ADMIN - BOOKING SETTINGS
   ========================================================= */

export const adminGetBookingSettings = () =>
  request<BookingSettings>(
    "/admin/booking-settings",
    {},
    true
  );

export const adminUpdateBookingSettings = (
  payload: {
    bookingMode: "interval" | "flexible";
    bookingIntervalMinutes: number;
  }
) =>
  request<BookingSettings>(
    "/admin/booking-settings",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    true
  );

/* =========================================================
   ADMIN - CLIENTS
   ========================================================= */

export const adminGetClients = (
  search?: string
) => {
  const query = search
    ? `?search=${encodeURIComponent(search)}`
    : "";

  return request<ClientRow[]>(
    `/admin/clients${query}`,
    {},
    true
  );
};

export const adminGetClientAppointments = (
  phone: string
) =>
  request<Appointment[]>(
    `/admin/clients/${encodeURIComponent(
      phone
    )}/appointments`,
    {},
    true
  );

/* =========================================================
   ADMIN - STATISTICS
   ========================================================= */

export const adminGetStats = (
  from?: string,
  to?: string
) => {
  const query = new URLSearchParams();

  if (from) {
    query.set("from", from);
  }

  if (to) {
    query.set("to", to);
  }

  const queryString = query.toString();

  return request<StatsResponse>(
    `/admin/stats${
      queryString ? `?${queryString}` : ""
    }`,
    {},
    true
  );
};

/* =========================================================
   ADMIN - NOTIFICATIONS
   ========================================================= */

export const adminGetNotifications = (
  limit = 50
) =>
  request<NotificationsResponse>(
    `/admin/notifications?limit=${limit}`,
    {},
    true
  );

export const adminMarkNotificationRead = (
  id: string
) =>
  request<{ ok: boolean }>(
    `/admin/notifications/${encodeURIComponent(
      id
    )}/read`,
    {
      method: "POST",
    },
    true
  );

export const adminMarkAllNotificationsRead = () =>
  request<{ ok: boolean }>(
    "/admin/notifications/mark-all-read",
    {
      method: "POST",
    },
    true
  );

/* =========================================================
   ERROR
   ========================================================= */

export { ApiRequestError };