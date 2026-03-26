export type UserRole = "organizer" | "member";
export type EventStatus = "draft" | "open" | "closed" | "published";
export type ResponseRole = "driver" | "rider" | "attending";
export type PreferenceType = "prefer" | "avoid";
export type CarpoolStatus = "auto" | "manual";

export type University =
  | "University of Georgia"
  | "Georgia Institute of Technology"
  | "Georgia State University"
  | "Emory University"
  | "Kennesaw State University"
  | "Other";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  default_role: ResponseRole | null;
  university: University | null;
  created_at: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  event_date: string;
  event_time: string | null;
  location: string;
  status: EventStatus;
  created_by: string;
  created_at: string;
}

export type LegRole = "driver" | "rider";

export interface Response {
  id: string;
  event_id: string;
  user_id: string;
  role: ResponseRole;
  before_role: LegRole | null;
  after_role: LegRole | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  needs_return_ride: boolean;
  return_address: string | null;
  return_lat: number | null;
  return_lng: number | null;
  available_seats: number | null;
  departure_time: string | null;
  note: string | null;
  submitted_at: string;
  updated_at: string;
}

export interface Preference {
  id: string;
  response_id: string;
  target_user_id: string;
  type: PreferenceType;
}

export interface Carpool {
  id: string;
  event_id: string;
  driver_id: string;
  route_summary: Record<string, unknown>;
  total_distance_meters: number;
  status: CarpoolStatus;
  created_at: string;
}

export interface CarpoolRider {
  id: string;
  carpool_id: string;
  rider_id: string;
  pickup_order: number;
}
