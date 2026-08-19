export type AppointmentStatus =
  | "confirmed"
  | "cancelled"
  | "completed"
  | "blocked";

export interface Staff {
  id: number;
  name: string;
  active: 0 | 1;
}

export interface ServiceRow {
  id: number;
  name_fr: string;
  name_ar: string;
  duration_minutes: number;
  active: 0 | 1;
}

export interface Appointment {
  id: string;

  staff_id: number;
  service_id: number | null;

  date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  end_time: string; // HH:mm

  client_name: string | null;
  client_phone: string | null;

  status: AppointmentStatus;

  notes: string | null;

  // Heure réelle d'arrivée du client
  arrived_at: string | null;

  // Heure réelle de fin du rendez-vous
  completed_at: string | null;

  // Retard du client en minutes
  // Exemple : RDV 14:00 + arrivée 14:02 = 2
  delay_minutes: number;

  created_at: string;
}

export interface AvailabilitySlot {
  time: string; // HH:mm
  available: boolean;
}