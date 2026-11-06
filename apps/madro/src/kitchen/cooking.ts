/**
 * Nedtælling og fremdrift i madlavningstilstanden.
 *
 * Filen må ikke importere andre filer, så testene kan køre direkte i Node.
 */

/** Sekunder som "20:00", eller "1:05:00" fra en time. */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Sekunder tilbage, når timeren slutter på `endAt` (ms). Aldrig under nul. */
export function remainingSeconds(endAt: number, now: number): number {
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}

/** En tid i sekunder som tekst: "20 minutter", "1 time", "1 time og 30 minutter". */
export function spoken(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 1 ? '1 time' : `${h} timer`;
  const mins = m === 1 ? '1 minut' : `${m} minutter`;
  if (h > 0 && m > 0) return `${hours} og ${mins}`;
  return h > 0 ? hours : mins;
}
