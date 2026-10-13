import type { ComponentType } from 'react';
import { t } from '../i18n-shim';

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
}

/** The only contract a real map (Leaflet, Google, Mapbox) must satisfy. Swap `BuyerMap` below. */
export interface MapViewProps {
  center: { lat: number; lng: number } | null;
  markers?: MapMarker[];
  className?: string;
}

export function MapPlaceholder({ center, markers = [], className = '' }: MapViewProps) {
  return (
    <div
      role="img"
      aria-label={t('buyer.track.mapAlt')}
      className={`flex min-h-48 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-ink/20 bg-mustard/10 p-4 text-center ${className}`}
    >
      <p className="font-heading font-bold">{t('buyer.track.mapTitle')}</p>
      <p className="text-sm text-ink/60">{center ? t('buyer.track.mapLive') : t('buyer.track.mapSoon')}</p>
      {markers.map((m) => (
        <p key={m.label} className="text-xs text-ink/50">
          {m.label}
        </p>
      ))}
    </div>
  );
}

export const BuyerMap: ComponentType<MapViewProps> = MapPlaceholder;
