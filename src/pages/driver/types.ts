// Driver-side row shapes. Mirrors the `driver_trips` view. The driver NEVER gets
// supplier prices, supplier identity, buyer surname/phone or the full delivery fee.
export type TripStatus = 'assigned' | 'picked_up' | 'delivered' | 'failed';
export type VehicleType = 'bakkie' | 'panel_van' | 'light_truck' | 'truck' | 'other';
export type DriverDocKind = 'licence' | 'prdp' | 'operator_card' | 'roadworthy' | 'insurance' | 'vehicle_photo' | 'contractor_agreement';
export const DRIVER_DOCS: DriverDocKind[] = ['licence', 'prdp', 'operator_card', 'roadworthy', 'insurance', 'vehicle_photo', 'contractor_agreement'];
export const VEHICLE_TYPES: VehicleType[] = ['bakkie', 'panel_van', 'light_truck', 'truck', 'other'];

export interface DriverTrip {
  id: string;
  allocation_id: string;
  driver_share_cents: number;
  status: TripStatus;
  pickup_count: number | null;
  disinfection_photo_path: string | null;
  forecast_temp_c: number | null;
  picked_up_at: string | null;
  delivered_count: number | null;
  delivered_at: string | null;
  pod_photo_path: string | null;
  created_at: string;
  updated_at: string;
}

/** Result of rpc `driver_trip_stops` — addresses and buyer FIRST name only. */
export interface TripStops {
  trip_id: string;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  drop_address: string | null;
  drop_lat: number | null;
  drop_lng: number | null;
  buyer_first_name: string | null;
  expected_birds: number | null;
  slot_label: string | null;
}

/** Result of rpc `driver_pickup_info`. */
export interface PickupInfo {
  trip_id: string;
  permit_valid_until: string | null;
  has_removal_permit: boolean;
  crosses_province: boolean;
  has_movement_permit: boolean;
  crates: number | null;
  max_per_crate: number | null;
  max_per_crate_hot: number | null;
  disinfection_photo_required: boolean;
  expected_birds: number | null;
}

export interface SupplierRequirementSummary {
  label: string; // anonymised, e.g. "Farm A" - never the real supplier
  province: string | null;
  covered_vehicle: boolean;
  max_journey_hours: number | null;
  needs_crates: boolean;
}

export interface DriverVehicle {
  vehicle_type: VehicleType | null;
  gvm_kg: number | null;
  vehicle_reg: string | null;
  covered: boolean;
  ventilated: boolean;
  crates_owned: number | null;
  capacity_birds: number | null;
}

export interface DriverDoc {
  id: string;
  kind: string;
  file_path: string | null;
  status: 'missing' | 'uploaded' | 'approved' | 'rejected';
  expires_on: string | null;
  notes: string | null;
}

export interface DriverTransfer {
  id: string;
  amount_cents: number;
  status: 'queued' | 'sent' | 'success' | 'failed' | 'reversed';
  trip_id: string | null;
  failure_reason: string | null;
  created_at: string;
}
