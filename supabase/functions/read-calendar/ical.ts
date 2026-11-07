// Finder de dage i en uge, hvor familien har noget om aftenen, ud fra en kalender (iCal).
//
// Alle tider regnes som klokkeslæt på væggen i Danmark. Tider i UTC omregnes, og tider
// med en anden tidszone end Danmark læses som lokale tider. Heldagsaftaler (fødselsdage,
// helligdage) gør ikke aftenen travl. Filen importerer intet, så testene kan køre direkte.

/** Aftenen, som en aftale skal røre ved for at gøre dagen travl. */
export const EVENING_FROM = 16;
export const EVENING_TO = 21;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_STEPS = 20000;

type Local = number; // millisekunder, hvor "nu på væggen" er skrevet som UTC

type Event = {
  uid: string;
  start: Local;
  end: Local;
  rrule: Map<string, string> | null;
  exdates: Set<Local>;
  recurrenceId: Local | null;
};

const dkFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Copenhagen',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Et tidspunkt i UTC som klokkeslæt på væggen i Danmark. */
function toDanish(utc: number): Local {
  const p = Object.fromEntries(dkFormat.formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

/** Samler linjer, der er brudt over flere linjer. */
function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

type Prop = { name: string; params: Map<string, string>; value: string };

function parseLine(line: string): Prop | null {
  const colon = line.indexOf(':');
  if (colon < 1) return null;
  const [name, ...rest] = line.slice(0, colon).split(';');
  const params = new Map<string, string>();
  for (const r of rest) {
    const eq = r.indexOf('=');
    if (eq > 0) params.set(r.slice(0, eq).toUpperCase(), r.slice(eq + 1).replace(/"/g, ''));
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1).trim() };
}

/** 20261105T180000Z, 20261105T180000 eller (heldag) 20261105. */
function parseTime(prop: Prop): { at: Local; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(prop.value);
  if (!m) return null;
  const allDay = m[4] === undefined || prop.params.get('VALUE') === 'DATE';
  const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return { at: m[7] ? toDanish(local) : local, allDay };
}

function parseDuration(value: string): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m) return null;
  return (+(m[1] ?? 0) * 7 + +(m[2] ?? 0)) * DAY + +(m[3] ?? 0) * HOUR + +(m[4] ?? 0) * MINUTE + +(m[5] ?? 0) * 1000;
}

export function parseEvents(text: string): Event[] {
  const events: Event[] = [];
  let current: { props: Prop[] } | null = null;
  let depth = 0;
  for (const line of unfold(text)) {
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      current = { props: [] };
      depth = 0;
    } else if (upper === 'END:VEVENT' && current) {
      const event = toEvent(current.props);
      if (event) events.push(event);
      current = null;
    } else if (current) {
      if (upper.startsWith('BEGIN:')) depth++;
      else if (upper.startsWith('END:')) depth--;
      else if (depth === 0) {
        const prop = parseLine(line);
        if (prop) current.props.push(prop);
      }
    }
  }
  return events;
}

function toEvent(props: Prop[]): Event | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const status = get('STATUS')?.value.toUpperCase();
  if (status === 'CANCELLED' || get('TRANSP')?.value.toUpperCase() === 'TRANSPARENT') return null;
  const startProp = get('DTSTART');
  const start = startProp && parseTime(startProp);
  if (!start || start.allDay) return null;
  let end = start.at + HOUR;
  const endProp = get('DTEND');
  const durationProp = get('DURATION');
  if (endProp) {
    const e = parseTime(endProp);
    if (e && e.at > start.at) end = e.at;
  } else if (durationProp) {
    const d = parseDuration(durationProp.value);
    if (d && d > 0) end = start.at + d;
  }
  const rrule = get('RRULE');
  const exdates = new Set<Local>();
  for (const p of props.filter((x) => x.name === 'EXDATE')) {
    for (const v of p.value.split(',')) {
      const t = parseTime({ ...p, value: v.trim() });
      if (t) exdates.add(t.at);
    }
  }
  const recId = get('RECURRENCE-ID');
  return {
    uid: get('UID')?.value ?? '',
    start: start.at,
    end,
    rrule: rrule ? new Map(rrule.value.split(';').map((kv) => kv.split('=') as [string, string])) : null,
    exdates,
    recurrenceId: recId ? (parseTime(recId)?.at ?? null) : null,
  };
}

const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Starttidspunkter for en gentagende aftale, til og med slutningen af perioden. */
function occurrences(event: Event, until: Local): Local[] {
  const rule = event.rrule;
  if (!rule) return [event.start];
  const freq = rule.get('FREQ');
  const interval = Math.max(1, parseInt(rule.get('INTERVAL') ?? '1', 10) || 1);
  const count = rule.has('COUNT') ? parseInt(rule.get('COUNT')!, 10) : Infinity;
  let last = until;
  const untilRule = rule.get('UNTIL');
  if (untilRule) {
    const t = parseTime({ name: 'UNTIL', params: new Map(), value: untilRule });
    if (t) last = Math.min(last, t.allDay ? t.at + DAY - 1 : t.at);
  }
  const timeOfDay = event.start % DAY;
  const firstDay = event.start - timeOfDay;
  const result: Local[] = [];
  const push = (t: Local): boolean => {
    if (t < event.start) return true;
    if (t > last || result.length >= count) return false;
    result.push(t);
    return true;
  };

  if (freq === 'DAILY') {
    for (let i = 0; i < MAX_STEPS; i++) if (!push(firstDay + i * interval * DAY + timeOfDay)) break;
  } else if (freq === 'WEEKLY') {
    const days = (rule.get('BYDAY') ?? '')
      .split(',')
      .map((d) => BYDAY[d.slice(-2).toUpperCase()])
      .filter((d) => d !== undefined);
    if (days.length === 0) days.push(new Date(event.start).getUTCDay());
    const sorted = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const mondayOffset = (new Date(event.start).getUTCDay() + 6) % 7;
    const weekZero = firstDay - mondayOffset * DAY;
    outer: for (let w = 0; w < MAX_STEPS; w++) {
      for (const d of sorted) {
        if (!push(weekZero + w * interval * 7 * DAY + ((d + 6) % 7) * DAY + timeOfDay)) {
          if (result.length >= count || weekZero + w * interval * 7 * DAY > last) break outer;
        }
      }
    }
  } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
    const s = new Date(event.start);
    for (let i = 0; i < MAX_STEPS; i++) {
      const months = freq === 'YEARLY' ? 12 * interval * i : interval * i;
      const d = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + months, s.getUTCDate()));
      // En dag, der ikke findes i måneden, springes over
      if (d.getUTCDate() !== s.getUTCDate()) continue;
      if (!push(d.getTime() + timeOfDay)) break;
    }
  } else {
    return [event.start];
  }
  return result;
}

/** Datoen som tekst, ÅÅÅÅ-MM-DD, ud fra et tidspunkt på væggen. */
function dateOf(t: Local): string {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Ugens travle dage (1 = mandag til 7 = søndag): dem hvor en aftale rører ved aftenen.
 * weekStart er mandagens dato, ÅÅÅÅ-MM-DD.
 */
export function busyDays(text: string, weekStart: string): number[] {
  const [y, m, d] = weekStart.split('-').map(Number);
  const monday = Date.UTC(y, m - 1, d);
  const weekEnd = monday + 7 * DAY;
  const events = parseEvents(text);

  // En flyttet enkeltaftale erstatter den oprindelige i rækken
  const moved = new Map<string, Set<Local>>();
  for (const e of events) {
    if (e.recurrenceId !== null) {
      const set = moved.get(e.uid) ?? new Set<Local>();
      set.add(e.recurrenceId);
      moved.set(e.uid, set);
    }
  }

  const busy = new Set<number>();
  for (const event of events) {
    const length = event.end - event.start;
    const replaced = moved.get(event.uid);
    for (const start of occurrences(event, weekEnd)) {
      if (event.exdates.has(start) || (event.recurrenceId === null && replaced?.has(start))) continue;
      const end = start + length;
      for (let i = 0; i < 7; i++) {
        const day = monday + i * DAY;
        if (start < day + EVENING_TO * HOUR && end > day + EVENING_FROM * HOUR) busy.add(i + 1);
      }
    }
  }
  return [...busy].sort((a, b) => a - b);
}

export { dateOf };
