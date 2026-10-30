/**
 * Hvornår man skal i gang med aftensmaden, og påmindelserne om det.
 *
 * Filen må ikke importere andre filer, så testene kan køre direkte i Node.
 */

export type Effort = 'hurtig' | 'mellem' | 'lang';

/** Minutter fra man går i gang, til maden er på bordet. Inkl. lidt tid til at dække bord. */
export const COOK_MINUTES: Record<Effort, number> = { hurtig: 25, mellem: 45, lang: 90 };

/** Spisetider, man kan vælge imellem. */
export const DINNER_TIMES = ['17:00', '17:30', '18:00', '18:30', '19:00'] as const;

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const toTime = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** "17:30:00" fra databasen bliver til "17:30". */
export const shortTime = (time: string) => time.slice(0, 5);

/** Tidspunktet man skal i gang, fx "16:45". */
export function startTime(dinner: string, effort: Effort): string {
  return toTime(toMinutes(dinner) - COOK_MINUTES[effort]);
}

/** "17.30" som man skriver klokkeslæt på dansk. */
export const clock = (time: string) => shortTime(time).replace(':', '.');

export type CookingDay = { date: string; dish: string; effort: Effort };

export type Reminder = { id: string; at: Date; title: string; body: string };

/**
 * Påmindelser om at gå i gang for de dage, der ikke er gået endnu.
 * Datoer og tider er i telefonens tidszone.
 */
export function reminders(days: CookingDay[], dinner: string, now: Date): Reminder[] {
  return days.flatMap((day) => {
    const start = startTime(dinner, day.effort);
    const [y, mo, d] = day.date.split('-').map(Number);
    const [h, mi] = start.split(':').map(Number);
    const at = new Date(y, mo - 1, d, h, mi);
    if (at.getTime() <= now.getTime()) return [];
    return [
      {
        id: `madro-${day.date}`,
        at,
        title: `Gå i gang med ${day.dish.charAt(0).toLowerCase()}${day.dish.slice(1)}`,
        body: `Så er maden klar kl. ${clock(dinner)}.`,
      },
    ];
  });
}
