export interface Property {
  property_id: string;
  property_name: string;
  geographic_location: string;
  total_units: number; // or dynamically computed length of rooms
}

export interface Room {
  room_number: string;
  property_id: string;
  status: 'Vacant' | 'Occupied';
  monthly_rent: number;
  utility_rate: number;
}

export interface Tenant {
  tenant_id: string;
  full_name: string;
  phone_number: string; // format e.g., 254712345678
  property_id: string;
  assigned_room_number: string;
  registration_date: string; // format YYYY-MM-DD
}

export interface Payment {
  transaction_id: string;
  tenant_id: string;
  property_id: string;
  amount: number;
  status: 'Completed' | 'Pending' | 'Failed';
  timestamp: string; // ISO String or milliseconds
  payment_mode: 'M-PESA' | 'Manual';
  checkout_request_id?: string; // For M-Pesa tracking
}

export interface MaintenanceTicket {
  ticket_id: string;
  tenant_id: string;
  property_id: string;
  issue_type: 'Bulb' | 'Socket' | 'Toilet' | 'Paint' | 'Other';
  description: string;
  status: 'Pending' | 'In Progress' | 'Resolved';
  created_at: string; // ISO String
  photo_url?: string; // Base64 or local server path
}

export type UserRole = 'Super-Admin' | 'Caretaker' | 'Tenant';

export interface AdminSession {
  role: 'Super-Admin' | 'Caretaker';
  property_id?: string; // Assigned property if caretaker
  name: string;
}

export interface TenantSession {
  tenant_id: string;
  property_id: string;
  room_number: string;
}
