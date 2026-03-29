export type UserRole = 'reporter' | 'worker' | 'utility_admin' | 'super_admin';
export type ReportStatus = 'submitted' | 'dispatched' | 'verified' | 'rejected' | 'work_order_created' | 'resolved';
export type BountyStatus = 'pending' | 'earned' | 'paid';
export type VerificationStatus = 'offered' | 'accepted' | 'declined' | 'en_route' | 'arrived' | 'completed' | 'failed';
export type ErrandStatus = 'open' | 'offered' | 'accepted' | 'picked_up' | 'delivered' | 'completed' | 'cancelled';
export type ErrandPhotoType = 'pickup' | 'dropoff';
export type WorkOrderStatus = 'open' | 'in_progress' | 'completed';

export interface User {
  id: string;
  email: string;
  phone: string | null;
  role: UserRole;
  full_name: string;
  is_online: boolean;
  expo_push_token: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  active: boolean;
}

export interface Report {
  id: string;
  reporter_id: string;
  category_id: string;
  description: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  photo_url: string;
  status: ReportStatus;
  bounty_amount: number;
  bounty_status: BountyStatus;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export interface Verification {
  id: string;
  report_id: string;
  worker_id: string;
  status: VerificationStatus;
  photo_url: string | null;
  notes: string | null;
  offered_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  created_at: string;
  report?: Report;
}

export interface Errand {
  id: string;
  posted_by: string;
  title: string;
  item_description: string | null;
  item_quantity: number;
  pickup_name: string | null;
  pickup_address: string;
  pickup_latitude: number;
  pickup_longitude: number;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  pickup_instructions: string | null;
  dropoff_address: string;
  dropoff_latitude: number;
  dropoff_longitude: number;
  dropoff_instructions: string | null;
  payout_amount: number;
  distance_miles: number | null;
  status: ErrandStatus;
  worker_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ErrandPhoto {
  id: string;
  errand_id: string;
  worker_id: string;
  type: ErrandPhotoType;
  photo_url: string;
  latitude: number | null;
  longitude: number | null;
  taken_at: string;
}

export interface WorkOrder {
  id: string;
  report_id: string | null;
  errand_id: string | null;
  created_by: string;
  utility_company: string | null;
  estimated_resolution_date: string | null;
  notes: string | null;
  status: WorkOrderStatus;
  created_at: string;
}
