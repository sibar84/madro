/**
 * Madros design-tokens, overført fra prototypen (palet B "Rugbrød og rødbede").
 *
 * Regler:
 * - Højst ét rødbede-element (beet) pr. skærm.
 * - Sennep (sun) bruges aldrig som tekst; brug amberInk.
 * - Grøntsagsfarverne i `Veg` bruges kun i illustrationer og tallerkener,
 *   aldrig i knapper eller tekst.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    background: '#F3EEE4', // kerne
    surface: '#E9D8C4', // skorpe
    card: '#FBF8F2',
    text: '#2B1D17', // rugbrød
    textSecondary: '#6B5A4E',
    line: '#E2D6C5',
    beet: '#8E1B42',
    beetSoft: '#F3DDE4',
    leaf: '#4F6E32', // dild, Plan
    leafSoft: '#E5EBD8',
    sun: '#E6B640', // sennep, Indkøb
    sunSoft: '#FBF0D3',
    amberInk: '#8A5A00',
    sky: '#2B5C8F', // fjord, Økonomi
    skySoft: '#E1ECF7',
    bad: '#B3261E',
    badSoft: '#FCE8E6',
    onBeet: '#F3EEE4',
  },
  dark: {
    background: '#1C1410',
    surface: '#120D0A',
    card: '#2A1F19',
    text: '#F3EEE4',
    textSecondary: '#BCAA9C',
    line: '#3B2E26',
    beet: '#E8789A',
    beetSoft: '#41202B',
    leaf: '#A9C27F',
    leafSoft: '#2A3220',
    sun: '#F0BE52',
    sunSoft: '#382C10',
    amberInk: '#F0BE52',
    sky: '#82B6EA',
    skySoft: '#16263A',
    bad: '#FF8A80',
    badSoft: '#3A1715',
    onBeet: '#1C1410',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Kun til illustrationer og tallerkener. */
export const Veg = {
  light: {
    gulerod: '#C8742F',
    tomat: '#B9432C',
    kartoffel: '#E6C98E',
    laks: '#E09A82',
    agurk: '#A9C27F',
    citron: '#EDCB55',
    loeg: '#D9BFCB',
    pasta: '#E7C77A',
    brun: '#9A5426',
    plate: '#FBF8F2',
    plateRim: '#E2D6C5',
  },
  dark: {
    gulerod: '#D9874A',
    tomat: '#D0583F',
    kartoffel: '#D8BA80',
    laks: '#E8A892',
    agurk: '#8FAA66',
    citron: '#E2C04E',
    loeg: '#B898A8',
    pasta: '#D9B866',
    brun: '#B0683A',
    plate: '#3A2C24',
    plateRim: '#4A392E',
  },
} as const;

/** Universernes markørfarve: en lille prik over fanen, aldrig hele skærmen. */
export const Universe = {
  plan: 'leaf',
  indkob: 'sun',
  kokken: 'text',
  okonomi: 'sky',
} as const satisfies Record<string, ThemeColor>;

export const Fonts = Platform.select({
  ios: { display: 'system-ui', body: 'system-ui' },
  default: { display: 'normal', body: 'normal' },
  web: { display: 'var(--font-display)', body: 'var(--font-body)' },
});

export const TextSize = {
  large: 34,
  title: 22,
  head: 17,
  body: 17,
  sub: 15,
  foot: 13,
  cap: 12,
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  card: 16,
  pill: 999,
} as const;

/** Bevægelse fra prototypen. Respektér altid reduceret bevægelse. */
export const Motion = {
  tap: 120,
  swap: 240,
  move: 420,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 720;
