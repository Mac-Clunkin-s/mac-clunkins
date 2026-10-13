// Supplier-side row shapes. Mirrors supabase/migrations/…_views.sql
// (`supplier_allocations`) and …_tables.sql. NO buyer fields exist here by design.
export type AllocationStatus = 'offered' | 'accepted' | 'declined' | 'ready' | 'collected';
export type BirdType = 'broiler' | 'hardbody' | 'indigenous';
export type WeightBand = 'under_1_5kg' | '1_5_to_2kg' | '2_to_2_5kg' | '2_5_to_3kg' | 'over_3kg';
export type DocumentStatus = 'missing' | 'uploaded' | 'approved' | 'rejected';
export type TransferStatus = 'queued' | 'sent' | 'success' | 'failed' | 'reversed';

export const BIRD_TYPES: BirdType[] = ['broiler', 'hardbody', 'indigenous'];
export const WEIGHT_BANDS: WeightBand[] = ['under_1_5kg', '1_5_to_2kg', '2_to_2_5kg', '2_5_to_3kg', 'over_3kg'];

export interface SupplierAllocation {
  id: string;
  order_id: string;
  quantity: number;
  supplier_price_cents: number;
  status: AllocationStatus;
  pickup_at: string | null;
  birds_counted: number | null;
  crates: number | null;
  welfare_ok: boolean | null;
  load_photo_path: string | null;
  removal_permit_path: string | null;
  permit_valid_until: string | null;
  crosses_province: boolean;
  movement_permit_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockRow {
  id?: string;
  week_start: string;
  bird_type: BirdType;
  birds_available: number;
  avg_weight_kg: number | null;
  load_days: string[] | null;
}

export interface PriceRow {
  bird_type: BirdType;
  weight_band: WeightBand;
  price_cents: number;
  min_order: number;
  active: boolean;
}

export interface Requirements {
  crate_spec: string | null;
  max_per_crate: number | null;
  max_per_crate_hot: number | null;
  covered_vehicle: boolean;
  loading_window: string | null;
  collection_point: string | null;
  disinfection_photo: boolean;
  no_other_farm_same_day: boolean;
  max_journey_hours: number | null;
}

export interface SupplierDetails {
  farm_name: string | null;
  pickup_address: string | null;
  province: string | null;
  paused: boolean;
  paused_reason: string | null;
}

export interface ComplianceDoc {
  id: string;
  kind: string;
  file_path: string | null;
  status: DocumentStatus;
  expires_on: string | null;
  notes: string | null;
}

export interface SupplierTransfer {
  id: string;
  amount_cents: number;
  status: TransferStatus;
  allocation_id: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface BankMasked {
  bank_name: string | null;
  account_holder: string | null;
  account_last4: string | null;
}
