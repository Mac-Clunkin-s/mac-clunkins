// Hand-maintained against supabase/migrations/20260926000200_enums.sql and
// 20260926000300_tables.sql. Keep in sync when those change.

export type UserRole = 'buyer' | 'supplier' | 'driver' | 'admin';
export type ProfileStatus = 'pending' | 'active' | 'suspended';
export type AppLanguage = 'en' | 'zu' | 'st' | 'tn';
export type BusinessType =
  | 'shisanyama'
  | 'kota_shop'
  | 'tavern'
  | 'caterer'
  | 'butchery'
  | 'spaza'
  | 'reseller'
  | 'farm'
  | 'transporter'
  | 'other';

export interface Profile {
  id: string;
  role: UserRole;
  status: ProfileStatus;
  full_name: string;
  business_name: string | null;
  business_type: BusinessType | null;
  whatsapp_phone: string | null;
  email: string | null;
  language: AppLanguage;
  pdma_number: string | null;
  created_at: string;
  updated_at: string;
}

export type ConsentType =
  | 'terms'
  | 'privacy_notice'
  | 'cross_border_transfer'
  | 'service_messaging'
  | 'marketing_messaging';
export type ConsentSource = 'signup' | 'settings' | 'reconsent';

export interface Consent {
  id: string;
  profile_id: string;
  consent_type: ConsentType;
  document_version: string;
  granted: boolean;
  source: ConsentSource;
  superseded_by: string | null;
  recorded_at: string;
}
