import type { NewAddressInput } from '../types';

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Everything address-to-coordinates goes through this interface so a real provider
 *  (Google, Mapbox, an SA gazetteer) can be dropped in without touching screens. */
export interface Geocoder {
  geocode(address: NewAddressInput & { provinceName: string }): Promise<GeoPoint | null>;
}

// Rough province centroids. APPROXIMATE: good enough for a "which region" hint, NOT for pricing.
const CENTROIDS: Record<string, GeoPoint> = {
  gauteng: { lat: -26.2, lng: 28.05 },
  'western cape': { lat: -33.2, lng: 21.5 },
  'eastern cape': { lat: -32.3, lng: 26.4 },
  'kwazulu-natal': { lat: -28.9, lng: 30.9 },
  limpopo: { lat: -23.4, lng: 29.4 },
  mpumalanga: { lat: -25.5, lng: 30.2 },
  'north west': { lat: -26.7, lng: 25.6 },
  'northern cape': { lat: -29.5, lng: 21.3 },
  'free state': { lat: -28.5, lng: 26.8 },
};

export class ProvinceCentroidGeocoder implements Geocoder {
  async geocode(a: { provinceName: string }): Promise<GeoPoint | null> {
    return CENTROIDS[a.provinceName.trim().toLowerCase()] ?? null;
  }
}

let active: Geocoder = new ProvinceCentroidGeocoder();
export const getGeocoder = (): Geocoder => active;
export const setGeocoder = (g: Geocoder): void => {
  active = g;
};
