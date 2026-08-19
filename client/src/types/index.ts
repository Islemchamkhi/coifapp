export interface Staff {
  id: number;
  name: string;
  active: 0 | 1;
}

export interface ServiceItem {
  id: number;
  name_fr: string;
  name_ar: string;
  duration_minutes: number;
  active: 0 | 1;
}

export type AppointmentStatus = "confirmed" | "cancelled" | "completed" | "blocked";

export interface Appointment {
  id: string;
  staff_id: number;
  service_id: number | null;
  date: string;
  start_time: string;
  end_time: string;
  client_name: string | null;
  client_phone: string | null;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  staff_name?: string;
  service_name_fr?: string;
  service_duration?: number;
}

export type SlotStatus = "available" | "booked";

export interface SlotWithStatus {
  time: string;
  status: SlotStatus;
}

export interface AvailabilityResponse {
  date: string;
  staffId: number;
  serviceId: number;
  durationMinutes: number;
  slots: SlotWithStatus[];
}

export interface BookingConfirmation {
  appointment: Appointment;
  service: ServiceItem;
  staff: Staff;
  clientsBefore: number;
  estimatedTime: string;
}

export interface ClientRow {
  client_phone: string;
  client_name: string;
  total_appointments: number;
  last_visit: string;
  cancellations: number;
}

export interface StatsResponse {
  totals: { total: number; cancelled: number; confirmed: number };
  byStaff: { staff_name: string; total: number }[];
  byService: { service_name: string; total: number }[];
  byHour: { hour: string; total: number }[];
  todayCount: number;
}

export interface AdminNotification {
  id: string;
  type: string;
  appointment_id: string | null;
  title: string;
  message: string;
  created_at: string;
  date?: string | null;
  start_time?: string | null;
  client_name?: string | null;
  service_name_fr?: string | null;
  staff_name?: string | null;
  read_at: string | null;
}

export interface ApiError {
  error: string;
  message: string;
}