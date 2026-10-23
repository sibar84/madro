/**
 * Regelmotoren, der laver ugens aftensmadsplan.
 *
 * Planen laves af faste regler, ikke af en sprogmodel, så den kan testes og
 * forklares. Hver valgt ret får begrundelseskoder, som appen oversætter til tekst.
 * Samme input og samme seed giver altid samme plan.
 *
 * Filen må ikke importere andre filer, så testene kan køre direkte i Node.
 */

export type Effort = 'hurtig' | 'mellem' | 'lang';

export type Dish = {
  id: string;
  name: string;
  main_protein: string;
  protein_tags: string[];
  ingredients: string[];
  allergens: string[];
  kid_friendly: 'ja' | 'delvist';
  kid_favorite: boolean;
  effort: Effort;
  months: number[];
};

export type Person = {
  id: string;
  display_name: string;
  birth_year: number | null;
  allergies: string[];
  dislikes: string[];
  /** Ugedage (1 = mandag) hvor personen ikke spiser med. */
  away_days: number[];
};

export type ReasonCode =
  | 'travl_dag'
  | 'hensyn'
  | 'weekend_tid'
  | 'boernefavorit'
  | 'boernevenlig'
  | 'saeson'
  | 'ny_protein'
  | 'ingen_hjemme'
  | 'ingen_ret';

export type PlannedDay = {
  /** YYYY-MM-DD */
  date: string;
  /** 1 = mandag, 7 = søndag */
  weekday: number;
  dishId: string | null;
  reasons: ReasonCode[];
  /** Id'er på dem, der spiser med. */
  eaters: string[];
};

export type PlanInput = {
  /** Mandagen i ugen, YYYY-MM-DD. */
  weekStart: string;
  dishes: Dish[];
  persons: Person[];
  /** Ugedage med travlhed, fx fodbold eller sene vagter. */
  busyDays: number[];
  /** Retter spist de seneste uger. De kommer kun igen, hvis der ikke er andet. */
  recentDishIds?: string[];
  seed?: string;
};

/** Børn til og med denne alder tæller som små, når retterne vurderes. */
const SMALL_CHILD_AGE = 6;

/** Ord, der dækker flere proteiner. "fisk" betyder også laks. */
const DISLIKE_ALIASES: Record<string, string[]> = {
  fisk: ['fisk', 'laks'],
};

const MAX_REASONS = 3;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Mandagen i den uge, datoen ligger i. */
export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  return addDays(date, 1 - weekday);
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Et tal mellem 0 og 1, der kun afhænger af teksten. */
function noise(text: string): number {
  let t = hash(text) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function dishText(dish: Dish): string {
  return [dish.name, dish.main_protein, ...dish.ingredients].join(' ').toLowerCase();
}

export function dislikes(person: Person, dish: Dish): boolean {
  const text = dishText(dish);
  return person.dislikes.some((raw) => {
    const word = raw.trim().toLowerCase();
    if (!word) return false;
    const tags = DISLIKE_ALIASES[word] ?? [word];
    return tags.some((tag) => dish.protein_tags.includes(tag)) || text.includes(word);
  });
}

export function cannotEat(person: Person, dish: Dish): boolean {
  return person.allergies.some((a) => dish.allergens.includes(a));
}

function primaryProtein(dish: Dish): string {
  return dish.protein_tags[0] ?? 'andet';
}

type DayContext = {
  date: string;
  weekday: number;
  month: number;
  busy: boolean;
  eaters: Person[];
  smallChildren: boolean;
  previous: (Dish | undefined)[];
  /** Næste dags ret, når en enkelt dag byttes. */
  next: Dish | undefined;
  usedProteins: Map<string, number>;
};

function score(dish: Dish, ctx: DayContext, recent: Set<string>, seed: string): number {
  let s = 0;
  const weekend = ctx.weekday >= 6;
  const friday = ctx.weekday === 5;

  if (ctx.busy) s += { hurtig: 6, mellem: 0, lang: -20 }[dish.effort];
  else if (weekend) s += { hurtig: 0, mellem: 1, lang: 3 }[dish.effort];
  else if (friday) s += { hurtig: 1, mellem: 1, lang: 0 }[dish.effort];
  else s += { hurtig: 1, mellem: 1, lang: -12 }[dish.effort];

  if (ctx.smallChildren) {
    if (dish.kid_friendly === 'delvist') s -= 4;
    if (dish.kid_favorite) s += 2;
  }

  const protein = primaryProtein(dish);
  if (ctx.previous[0] && primaryProtein(ctx.previous[0]) === protein) s -= 8;
  if (ctx.previous[1] && primaryProtein(ctx.previous[1]) === protein) s -= 2;
  if (ctx.next && primaryProtein(ctx.next) === protein) s -= 8;
  s -= 3 * Math.max(0, (ctx.usedProteins.get(protein) ?? 0) - 1);

  if (recent.has(dish.id)) s -= 6;
  if (dish.months.length < 12) s += 1;

  return s + 3 * noise(`${seed}|${ctx.date}|${dish.id}`);
}

function reasonsFor(dish: Dish, ctx: DayContext, filtered: boolean): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  if (ctx.busy && dish.effort === 'hurtig') reasons.push('travl_dag');
  if (filtered) reasons.push('hensyn');
  if (ctx.weekday >= 5 && dish.effort === 'lang') reasons.push('weekend_tid');
  if (ctx.smallChildren && dish.kid_favorite) reasons.push('boernefavorit');
  if (dish.months.length < 12) reasons.push('saeson');
  // Afveksling og børnevenlighed gælder næsten hver dag, så de nævnes kun, når intet andet er sagt.
  if (reasons.length === 0 && ctx.previous[0] && primaryProtein(ctx.previous[0]) !== primaryProtein(dish)) {
    reasons.push('ny_protein');
  }
  if (reasons.length === 0 && ctx.smallChildren && dish.kid_friendly === 'ja') reasons.push('boernevenlig');
  return reasons.slice(0, MAX_REASONS);
}

function eatersOn(persons: Person[], weekday: number): Person[] {
  return persons.filter((p) => !p.away_days.includes(weekday));
}

function hasSmallChildren(eaters: Person[], year: number): boolean {
  return eaters.some((p) => p.birth_year !== null && year - p.birth_year <= SMALL_CHILD_AGE);
}

/** Vælger den bedste ret til én dag. Returnerer null, hvis ingen ret passer. */
function pickDish(
  input: PlanInput,
  ctx: DayContext,
  exclude: Set<string>,
  seed: string,
): { dish: Dish; filtered: boolean } | null {
  const recent = new Set(input.recentDishIds ?? []);
  const candidates = input.dishes
    .filter((d) => d.months.includes(ctx.month) && !exclude.has(d.id) && !(ctx.busy && d.effort === 'lang'))
    .map((dish) => ({ dish, score: score(dish, ctx, recent, seed) }))
    .sort((a, b) => b.score - a.score);
  const allowed = candidates.find(({ dish }) => !ctx.eaters.some((p) => cannotEat(p, dish) || dislikes(p, dish)));
  if (!allowed) return null;
  // "hensyn" gives kun, når den ret, der ellers ville være valgt, blev fravalgt af hensyn.
  return { dish: allowed.dish, filtered: allowed !== candidates[0] };
}

function contextFor(input: PlanInput, offset: number, chosen: (Dish | undefined)[]): DayContext {
  const date = addDays(input.weekStart, offset);
  const weekday = offset + 1;
  const eaters = eatersOn(input.persons, weekday);
  const usedProteins = new Map<string, number>();
  for (const d of chosen) {
    if (d) usedProteins.set(primaryProtein(d), (usedProteins.get(primaryProtein(d)) ?? 0) + 1);
  }
  return {
    date,
    weekday,
    month: Number(date.slice(5, 7)),
    busy: input.busyDays.includes(weekday),
    eaters,
    smallChildren: hasSmallChildren(eaters, Number(date.slice(0, 4))),
    previous: [chosen[offset - 1], chosen[offset - 2]],
    next: chosen[offset + 1],
    usedProteins,
  };
}

export function planWeek(input: PlanInput): PlannedDay[] {
  const seed = input.seed ?? input.weekStart;
  const chosen: (Dish | undefined)[] = [];
  const days: PlannedDay[] = [];

  for (let offset = 0; offset < 7; offset++) {
    const ctx = contextFor(input, offset, chosen);
    const eaters = ctx.eaters.map((p) => p.id);
    if (eaters.length === 0) {
      chosen.push(undefined);
      days.push({ date: ctx.date, weekday: ctx.weekday, dishId: null, reasons: ['ingen_hjemme'], eaters });
      continue;
    }
    const used = new Set(chosen.filter((d): d is Dish => !!d).map((d) => d.id));
    const pick = pickDish(input, ctx, used, seed);
    chosen.push(pick?.dish);
    days.push({
      date: ctx.date,
      weekday: ctx.weekday,
      dishId: pick?.dish.id ?? null,
      reasons: pick ? reasonsFor(pick.dish, ctx, pick.filtered) : ['ingen_ret'],
      eaters,
    });
  }
  return days;
}

/**
 * Bytter retten på én dag. De andre dage står, og den nye ret er hverken
 * dagens gamle ret eller en ret, der allerede er i ugen. attempt gør, at
 * flere byt i træk giver forskellige forslag.
 */
export function swapDay(input: PlanInput, plan: PlannedDay[], date: string, attempt = 1): PlannedDay[] {
  const offset = plan.findIndex((d) => d.date === date);
  if (offset < 0) return plan;
  const byId = new Map(input.dishes.map((d) => [d.id, d]));
  const chosen = plan.map((d) => (d.dishId ? byId.get(d.dishId) : undefined));
  const ctx = contextFor(input, offset, chosen);
  if (ctx.eaters.length === 0) return plan;

  const exclude = new Set(plan.map((d) => d.dishId).filter((id): id is string => !!id));
  const pick = pickDish(input, ctx, exclude, `${input.seed ?? input.weekStart}|byt|${attempt}`);
  if (!pick) return plan;

  return plan.map((day, i) =>
    i === offset
      ? { ...day, dishId: pick.dish.id, reasons: reasonsFor(pick.dish, ctx, pick.filtered), eaters: ctx.eaters.map((p) => p.id) }
      : day,
  );
}
