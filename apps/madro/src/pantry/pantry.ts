// Lageret: sortering og tekster. Ingen imports, så testene kan køre direkte.

export type Place = 'koleskab' | 'fryser' | 'skab';

export const PLACES: [Place, string][] = [
  ['koleskab', 'Køleskab'],
  ['fryser', 'Fryser'],
  ['skab', 'Skab'],
];

export type PantryItem = { id: string; name: string; place: Place; expires_on: string | null };

/** Hvor længe varen holder fra i dag: valgene, når man lægger en vare ind. */
export const SHELF: [string, number | null][] = [
  ['I dag', 0],
  ['I morgen', 1],
  ['3 dage', 3],
  ['En uge', 7],
  ['Ingen dato', null],
];

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Datoen et antal dage fra en dato, ÅÅÅÅ-MM-DD. */
export function inDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Dage til sidste brugsdag: 0 er i dag, negativt er overskredet, null har ingen dato. */
export function daysLeft(item: Pick<PantryItem, 'expires_on'>, today: string): number | null {
  return item.expires_on ? dayNumber(item.expires_on) - dayNumber(today) : null;
}

export function expiryLabel(item: Pick<PantryItem, 'expires_on'>, today: string): string {
  const left = daysLeft(item, today);
  if (left === null) return 'Ingen dato';
  if (left < -1) return `Udløb for ${-left} dage siden`;
  if (left === -1) return 'Udløb i går';
  if (left === 0) return 'Brug i dag';
  if (left === 1) return 'Brug i morgen';
  return `Holder ${left} dage`;
}

/** Varer med dato først (den korteste tid først), så varer uden dato, hver gruppe efter navn. */
export function sortPantry<T extends PantryItem>(items: T[], today: string): T[] {
  return [...items].sort((a, b) => {
    const da = daysLeft(a, today);
    const db = daysLeft(b, today);
    if (da !== db) {
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    }
    return a.name.localeCompare(b.name, 'da');
  });
}

/** Varer, der skal bruges inden for et par dage, også de overskredne. Frysevarer holder længere og tæller ikke. */
export function useFirst<T extends PantryItem>(items: T[], today: string, within = 2): T[] {
  return sortPantry(
    items.filter((i) => i.place !== 'fryser' && (daysLeft(i, today) ?? Infinity) <= within),
    today,
  );
}

export function cleanName(input: string): string {
  const name = input.trim().replace(/\s+/g, ' ');
  return name.slice(0, 80);
}
