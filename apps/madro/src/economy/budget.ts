/**
 * Madbudgettet: budgetperioden fra lønningsdag til lønningsdag og forbruget pr. uge.
 *
 * Filen må ikke importere andre filer, så testene kan køre direkte i Node.
 */

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const mondayOf = (date: string) => addDays(date, 1 - (new Date(`${date}T12:00:00Z`).getUTCDay() || 7));

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Lønningsdagen i en given måned. Den 31. bliver den sidste dag i en kortere måned. */
function paydayIn(year: number, month: number, payday: number): string {
  const day = Math.min(payday, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export type Period = { start: string; end: string };

/** Den budgetperiode, datoen ligger i. end er dagen før næste lønningsdag. */
export function periodFor(date: string, payday: number): Period {
  const [y, m] = date.split('-').map(Number);
  const thisMonth = paydayIn(y, m, payday);
  const [sy, sm] = date >= thisMonth ? [y, m] : m === 1 ? [y - 1, 12] : [y, m - 1];
  const start = paydayIn(sy, sm, payday);
  const [ny, nm] = sm === 12 ? [sy + 1, 1] : [sy, sm + 1];
  return { start, end: addDays(paydayIn(ny, nm, payday), -1) };
}

export type SpendLine = { amount: number; category: string; purchased_on: string | null };

export type WeekSpend = { weekStart: string; amount: number };

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Forbruget på mad i perioden, i alt og pr. uge. Linjer, der ikke er mad, tæller ikke.
 * En uge, der går ind i perioden, tæller kun de dage, der ligger i perioden.
 */
export function spending(lines: SpendLine[], period: Period): { total: number; weeks: WeekSpend[] } {
  const weeks = new Map<string, number>();
  for (let w = mondayOf(period.start); w <= period.end; w = addDays(w, 7)) weeks.set(w, 0);
  let total = 0;
  for (const line of lines) {
    if (line.category === 'ikke_mad' || !line.purchased_on) continue;
    if (line.purchased_on < period.start || line.purchased_on > period.end) continue;
    const week = mondayOf(line.purchased_on);
    weeks.set(week, (weeks.get(week) ?? 0) + line.amount);
    total += line.amount;
  }
  return { total: round(total), weeks: [...weeks].map(([weekStart, amount]) => ({ weekStart, amount: round(amount) })) };
}

/** "24. okt." */
export function shortDate(date: string): string {
  const months = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
  const [, m, d] = date.split('-').map(Number);
  return `${d}. ${months[m - 1]}`;
}

/** "1.234 kr." */
export function kroner(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kr.`;
}
