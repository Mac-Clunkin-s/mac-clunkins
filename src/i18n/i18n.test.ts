import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  STORAGE_KEY,
  detectLocale,
  getLocale,
  interpolate,
  setLocale,
  subscribe,
  t,
} from './index';

describe('interpolate', () => {
  it('replaces {name} placeholders', () => {
    expect(interpolate('Hi {name}, {n} birds', { name: 'Thandi', n: 12 })).toBe('Hi Thandi, 12 birds');
  });

  it('replaces repeated placeholders', () => {
    expect(interpolate('{a}{a}', { a: 'x' })).toBe('xx');
  });

  it('leaves unknown placeholders visible', () => {
    expect(interpolate('Hi {name}', {})).toBe('Hi {name}');
  });

  it('returns the template untouched without params', () => {
    expect(interpolate('Hi {name}')).toBe('Hi {name}');
  });

  it('renders 0 and empty-string params rather than skipping them', () => {
    expect(interpolate('{n}|{s}', { n: 0, s: '' })).toBe('0|');
  });
});

describe('detectLocale', () => {
  it('prefers the stored choice', () => {
    expect(detectLocale({ stored: 'zu', languages: ['en-ZA'] })).toBe('zu');
  });

  it('ignores a stored value that is not a supported locale', () => {
    expect(detectLocale({ stored: 'fr', languages: ['st-ZA'] })).toBe('st');
  });

  it('matches the primary subtag of browser languages in order', () => {
    expect(detectLocale({ stored: null, languages: ['fr-FR', 'tn-BW', 'en'] })).toBe('tn');
  });

  it('is case-insensitive', () => {
    expect(detectLocale({ stored: null, languages: ['ZU-za'] })).toBe('zu');
  });

  it('falls back to English', () => {
    expect(detectLocale({ stored: null, languages: ['de', 'fr'] })).toBe(DEFAULT_LOCALE);
    expect(detectLocale({ stored: null, languages: [] })).toBe('en');
  });

  it('reads localStorage when no stored value is passed', () => {
    window.localStorage.setItem(STORAGE_KEY, 'st');
    expect(detectLocale({ languages: ['en'] })).toBe('st');
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(detectLocale({ languages: ['zu'] })).toBe('zu');
  });
});

describe('locale state', () => {
  beforeEach(() => setLocale('en'));

  it('lists the four supported locales', () => {
    expect(LOCALES.map((l) => l.code)).toEqual(['en', 'zu', 'st', 'tn']);
  });

  it('setLocale updates state, storage and <html lang>', () => {
    setLocale('zu');
    expect(getLocale()).toBe('zu');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('zu');
    expect(document.documentElement.lang).toBe('zu');
  });

  it('notifies subscribers once per real change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setLocale('st');
    setLocale('st');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setLocale('tn');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores unsupported locales', () => {
    setLocale('fr' as never);
    expect(getLocale()).toBe('en');
  });
});

describe('t', () => {
  beforeEach(() => setLocale('en'));

  it('returns English text for a known key', () => {
    expect(t('login.title')).toBe('Log in');
  });

  it('interpolates params', () => {
    expect(t('pending.thanksName', { name: 'Sipho' })).toBe('Thanks, Sipho. Your account is in review.');
  });

  it('falls back to English when the active locale has no translation', () => {
    setLocale('zu');
    expect(t('login.title')).toBe('Log in');
  });

  it('returns the key itself when it exists nowhere', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  it('still interpolates a fallback key', () => {
    setLocale('tn');
    expect(t('pending.thanksName', { name: 'Lerato' })).toContain('Lerato');
  });
});
