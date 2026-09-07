import type { AccentColor } from './types';

export interface AccentDefinition {
  id: AccentColor;
  name: string;
  accent: string;
  accentHover: string;
  accentInk: string;
  accentSoft: string;
  logoFilter: string;
  swatch: string;
}

export const ACCENT_STORAGE_KEY = 'pocket:accent';
export const DEFAULT_ACCENT: AccentColor = 'gold';

export const ACCENT_COLORS: readonly AccentDefinition[] = [
  {
    id: 'red',
    name: 'Red',
    accent: 'oklch(0.68 0.22 25)',
    accentHover: 'oklch(0.73 0.20 25)',
    accentInk: 'oklch(0.18 0.05 25)',
    accentSoft: 'oklch(0.68 0.22 25 / 0.16)',
    logoFilter: 'hue-rotate(318deg) saturate(1.15)',
    swatch: 'oklch(0.68 0.22 25)',
  },
  {
    id: 'orange',
    name: 'Orange',
    accent: 'oklch(0.74 0.19 50)',
    accentHover: 'oklch(0.79 0.18 50)',
    accentInk: 'oklch(0.20 0.05 50)',
    accentSoft: 'oklch(0.74 0.19 50 / 0.15)',
    logoFilter: 'hue-rotate(344deg)',
    swatch: 'oklch(0.74 0.19 50)',
  },
  {
    id: 'gold',
    name: 'Gold',
    accent: 'oklch(0.795 0.146 71)',
    accentHover: 'oklch(0.845 0.14 71)',
    accentInk: 'oklch(0.22 0.05 71)',
    accentSoft: 'oklch(0.795 0.146 71 / 0.14)',
    logoFilter: 'none',
    swatch: 'oklch(0.795 0.146 71)',
  },
  {
    id: 'lime-green',
    name: 'Green',
    accent: 'oklch(0.80 0.19 135)',
    accentHover: 'oklch(0.85 0.18 135)',
    accentInk: 'oklch(0.20 0.05 135)',
    accentSoft: 'oklch(0.80 0.19 135 / 0.15)',
    logoFilter: 'hue-rotate(69deg) saturate(1.05)',
    swatch: 'oklch(0.80 0.19 135)',
  },
  {
    id: 'cyan',
    name: 'Cyan',
    accent: 'oklch(0.78 0.14 205)',
    accentHover: 'oklch(0.83 0.13 205)',
    accentInk: 'oklch(0.20 0.04 205)',
    accentSoft: 'oklch(0.78 0.14 205 / 0.15)',
    logoFilter: 'hue-rotate(144deg)',
    swatch: 'oklch(0.78 0.14 205)',
  },
  {
    id: 'blue',
    name: 'Blue',
    accent: 'oklch(0.70 0.17 250)',
    accentHover: 'oklch(0.75 0.16 250)',
    accentInk: 'oklch(0.98 0 0)',
    accentSoft: 'oklch(0.70 0.17 250 / 0.16)',
    logoFilter: 'hue-rotate(184deg) saturate(1.1)',
    swatch: 'oklch(0.70 0.17 250)',
  },
  {
    id: 'purple',
    name: 'Purple',
    accent: 'oklch(0.72 0.18 300)',
    accentHover: 'oklch(0.77 0.17 300)',
    accentInk: 'oklch(0.98 0 0)',
    accentSoft: 'oklch(0.72 0.18 300 / 0.16)',
    logoFilter: 'hue-rotate(234deg) saturate(1.15)',
    swatch: 'oklch(0.72 0.18 300)',
  },
  {
    id: 'pink',
    name: 'Pink',
    accent: 'oklch(0.75 0.18 345)',
    accentHover: 'oklch(0.80 0.17 345)',
    accentInk: 'oklch(0.20 0.05 345)',
    accentSoft: 'oklch(0.75 0.18 345 / 0.15)',
    logoFilter: 'hue-rotate(289deg) saturate(1.1)',
    swatch: 'oklch(0.75 0.18 345)',
  },
] as const;

export function normalizeAccentId(id: string | null | undefined): AccentColor {
  if (!id) return DEFAULT_ACCENT;
  const clean = id.trim().toLowerCase();
  if (clean === 'lime green' || clean === 'lime-green') return 'lime-green';
  const found = ACCENT_COLORS.find((item) => item.id === clean);
  return found ? found.id : DEFAULT_ACCENT;
}

export function getAccentDefinition(id: string | null | undefined): AccentDefinition {
  const normalized = normalizeAccentId(id);
  const found = ACCENT_COLORS.find((item) => item.id === normalized);
  return (found ?? ACCENT_COLORS[2]) as AccentDefinition;
}

export function applyAccent(id: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const def = getAccentDefinition(id);
  const root = document.documentElement;
  root.style.setProperty('--color-accent', def.accent);
  root.style.setProperty('--color-accent-hover', def.accentHover);
  root.style.setProperty('--color-accent-ink', def.accentInk);
  root.style.setProperty('--color-accent-soft', def.accentSoft);
  root.style.setProperty('--logo-filter', def.logoFilter);
}

export function initAccent(): AccentColor {
  if (typeof window === 'undefined') return DEFAULT_ACCENT;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
  } catch {
    // Storage access restricted in private window
  }
  const accent = normalizeAccentId(stored);
  applyAccent(accent);
  return accent;
}
