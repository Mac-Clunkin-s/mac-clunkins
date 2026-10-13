// Admin-only types, hand-maintained against supabase/migrations/*enums.sql + *tables.sql.
// Kept out of src/lib/types.ts on purpose (shared file). Money is always integer cents.
import type { Profile } from '../../lib/types';

export type OrderStatus =
  | 'placed' | 'paid' | 'scheduled' | 'ready' | 'on_the_way'
  | 'delivered' | 'settled' | 'cancelled' | 'refunded';
export const ORDER_STATUSES: OrderStatus[] = [
  'placed', 'paid', 'scheduled', 'ready', 'on_the_way', 'delivered', 'settled', 'cancelled', 'refunded',
];
export type BirdType = 'broiler' | 'hardbody' | 'indigenous';
export type AvianFluZone = 'none' | 'surveillance' | 'controlled';
export type AllocationStatus = 'offered' | 'accepted' | 'declined' | 'ready' | 'collected';
export type TripStatus = 'assigned' | 'picked_up' | 'delivered' | 'failed';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'disputed';
export type PaymentChannel = 'card' | 'eft' | 'capitec_pay' | 'qr';
export type TransferStatus = 'queued' | 'sent' | 'success' | 'failed' | 'reversed';
export type PartyType = 'supplier' | 'driver';
export type CaseType =
  | 'short_count' | 'sick_injured' | 'died' | 'late' | 'failed_delivery' | 'payment' | 'other';
export type CaseStatus = 'open' | 'in_review' | 'awaiting_info' | 'resolved' | 'closed';
export type CaseResolution = 'refund' | 'credit' | 'replacement' | 'none';
export type CaseCostOwner = 'supplier' | 'driver' | 'mccluckins';
export type DocumentStatus = 'missing' | 'uploaded' | 'approved' | 'rejected';

export interface NameRef { full_name: string; business_name: string | null }

export interface OrderRow {
  id: string; number: string; buyer_id: string; bird_type: BirdType; weight_band: string;
  quantity: number; bird_price_cents: number; delivery_fee_cents: number; service_fee_cents: number;
  total_cents: number; status: OrderStatus; delivery_date: string | null; slot_id: string | null;
  placed_at: string; paid_at: string | null; cancelled_at: string | null;
  buyer?: NameRef | null;
  address?: { town: string; province: string | null } | null;
  slot?: { label: string } | null;
}
export interface AllocationRow {
  id: string; order_id: string; supplier_id: string; quantity: number;
  /** Per bird, in cents (assumption: matches the worked example, 50 x R75). */
  supplier_price_cents: number; distance_km: number | null; status: AllocationStatus;
  pickup_at: string | null; birds_counted: number | null; crates: number | null;
  permit_valid_until: string | null; crosses_province: boolean; movement_permit_path: string | null;
  removal_permit_path: string | null; created_at: string;
  supplier?: NameRef | null;
}
export interface TripRow {
  id: string; allocation_id: string; driver_id: string | null; delivery_fee_cents: number;
  driver_share_cents: number; status: TripStatus; pickup_count: number | null;
  delivered_count: number | null; picked_up_at: string | null; delivered_at: string | null;
  forecast_temp_c: number | null; driver?: NameRef | null;
}
export interface PaymentRow {
  id: string; order_id: string; paystack_reference: string | null; channel: PaymentChannel | null;
  amount_cents: number; fee_cents: number | null; status: PaymentStatus; created_at: string;
}
export interface TransferRow {
  id: string; party_id: string; party_type: PartyType; allocation_id: string | null;
  trip_id: string | null; amount_cents: number; paystack_transfer_code: string | null;
  status: TransferStatus; failure_reason: string | null; created_at: string;
  party?: NameRef | null;
}
export interface OrderEventRow {
  id: string; order_id: string; status: OrderStatus; actor_id: string | null; note: string | null;
  created_at: string; actor?: { full_name: string } | null;
}
export interface CaseRow {
  id: string; number: string; order_id: string | null; raised_by: string; type: CaseType;
  birds_affected: number | null; description: string | null; photo_paths: string[] | null;
  status: CaseStatus; resolution: CaseResolution | null; amount_cents: number | null;
  cost_to: CaseCostOwner | null; reply_due_at: string | null; resolved_at: string | null;
  created_at: string; order?: { number: string; quantity: number } | null;
  raiser?: NameRef | null;
}
export interface CaseEventRow {
  id: string; case_id: string; actor_id: string | null; kind: 'message' | 'status' | 'evidence' | 'refund';
  body: string | null; visible_to_buyer: boolean; created_at: string; actor?: { full_name: string } | null;
}
export interface DocumentRow {
  id: string; profile_id: string; kind: string; file_path: string | null; status: DocumentStatus;
  expires_on: string | null; notes: string | null; reviewed_at: string | null;
}
export interface SupplierDetails {
  profile_id: string; farm_name: string | null; province: string | null;
  avian_flu_zone: AvianFluZone; paused: boolean; paused_reason: string | null; rating_avg: number | null;
}
export interface SupplierRequirements {
  supplier_id: string; max_per_crate: number | null; max_per_crate_hot: number | null;
  covered_vehicle: boolean; max_journey_hours: number | null;
}
export interface DriverDetails {
  profile_id: string; vehicle_type: string | null; gvm_kg: number | null; covered: boolean;
  ventilated: boolean; crates_owned: number | null; capacity_birds: number | null;
  paused: boolean; rating_avg: number | null; profile?: NameRef | null;
}
export interface DeliverySlot { id: string; label: string; start_time: string; end_time: string; active: boolean }
export interface AreaRow { province: string; active: boolean; launch_order: number | null; name?: string }
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type SettingsMap = Record<string, JsonValue>;
export type AdminProfile = Profile;

/**
 * Contract for the backend RPC `match_suppliers(p_order_id uuid)` (TODO: backend agent adds it).
 * Returns one row per candidate supplier; the UI ranks them (eligible first, same province,
 * distance, landed cost per bird).
 */
export interface MatchCandidate {
  supplier_id: string;
  supplier_name: string;
  province: string | null;
  same_province: boolean;
  distance_km: number;
  journey_minutes: number;
  /** Supplier's own price per bird. */
  price_cents: number;
  /** Supplier price + markup + share of delivery, per bird. */
  landed_cents_per_bird: number;
  est_delivery_fee_cents: number | null;
  stock_available: number;
  requirement_fit: 'ok' | 'partial' | 'fail';
  requirement_notes: string[];
  avian_flu_zone: AvianFluZone;
  paused: boolean;
  rating_avg: number | null;
}
