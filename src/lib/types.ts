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
