export type AppointmentStatus =
  | "confirmed"
  | "pending"
  | "cancelled"
  | "completed"
  | "blocked";

/**
 * ============================================================
 * STAFF
 * ============================================================
 */

export interface Staff {
  id: number;
  name: string;
  active: 0 | 1;
}

/**
 * ============================================================
 * SERVICES
 * ============================================================
 */

export interface ServiceRow {
  id: number;
  name_fr: string;
  name_ar: string;
  duration_minutes: number;
  price: number;
  active: 0 | 1;
}

export interface ServiceItem {
  id: number;
  name_fr: string;
  name_ar: string;
  duration_minutes: number;
  price: number;
  active: 0 | 1;
}

/**
 * ============================================================
 * CLIENT
 * ============================================================
 */

export interface ClientRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface ClientAccount {
  id: number;
  name: string;
  phone: string;
  email: string;
}

/**
 * ============================================================
 * APPOINTMENT
 * ============================================================
 */

export interface Appointment {
  id: string;

  staff_id: number;

  service_id: number | null;

  client_id: number | null;

  date: string; // YYYY-MM-DD

  start_time: string; // HH:mm

  end_time: string; // HH:mm

  client_name: string | null;

  client_phone: string | null;

  status: AppointmentStatus;

  notes: string | null;

  /**
   * Heure réelle d'arrivée du client
   */
  arrived_at: string | null;

  /**
   * Heure réelle de fin du rendez-vous
   */
  completed_at: string | null;

  /**
   * Retard du client en minutes
   *
   * Exemple :
   * RDV 14:00 + arrivée 14:02 = 2
   */
  delay_minutes: number;

  created_at: string;
}

/**
 * ============================================================
 * AVAILABILITY
 * ============================================================
 */

export interface AvailabilitySlot {
  time: string; // HH:mm
  available: boolean;
}

export interface AvailabilityResponse {
  date: string;
  staffId: number;
  serviceId: number;
  slots: AvailabilitySlot[];
}

/**
 * ============================================================
 * BOOKING
 * ============================================================
 */

export interface BookingConfirmation {
  appointment: Appointment;
  message?: string;
}

/**
 * ============================================================
 * NOTIFICATIONS
 * ============================================================
 */

export interface Notification {
  id: string;

  type: string;

  appointment_id: string | null;

  title: string;

  message: string;

  date: string | null;

  start_time: string | null;

  client_name: string | null;

  service_name_fr: string | null;

  staff_name: string | null;

  read_at: string | null;

  created_at: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

/**
 * ============================================================
 * API ERRORS
 * ============================================================
 */

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * ============================================================
 * BOOKING SETTINGS
 * ============================================================
 */

export type BookingMode =
  | "interval"
  | "flexible";

export interface BookingSettings {
  bookingMode: BookingMode;
  bookingIntervalMinutes: number;
}

/**
 * ============================================================
 * STATS
 * ============================================================
 */

export interface StatsTotals {
  total: number;
  cancelled: number;
  confirmed: number;
  completed: number;
}

export interface StatsByStaff {
  staff_name: string;
  total: number;
}

export interface StatsByService {
  service_name: string;
  total: number;
}

export interface StatsByHour {
  hour: string;
  total: number;
}

export interface StatsResponse {
  totals: StatsTotals;
  byStaff: StatsByStaff[];
  byService: StatsByService[];
  byHour: StatsByHour[];
  todayCount: number;
}