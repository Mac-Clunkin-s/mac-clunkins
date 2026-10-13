import { loadSettings } from '../api';
import type { SettingsMap } from '../types';
import { useAdminData } from './useAdminData';

export function useSettings() {
  const r = useAdminData<SettingsMap>(loadSettings, []);
  const num = (key: string, fallback: number): number => {
    const v = r.data?.[key];
    return typeof v === 'number' ? v : fallback;
  };
  return { ...r, num };
}
