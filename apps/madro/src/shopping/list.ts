/**
 * Indkøbslisten: varerne fra ugens plan og de faste varer, sorteret efter
 * butikkens gange, og forslag til en anden vare, når noget er udsolgt.
 *
 * Filen må ikke importere andre filer, så testene kan køre direkte i Node.
 */

/** Butikkens gange i den rækkefølge, de fleste danske butikker har dem. */
export const CATEGORIES = [
  ['frugt_groent', 'Frugt og grønt'],
  ['broed', 'Brød'],
  ['koed_fisk', 'Kød, fisk og køl'],
  ['mejeri', 'Mejeri og æg'],
  ['kolonial', 'Kolonial'],
  ['frost', 'Frost'],
  ['drikke', 'Drikkevarer'],
  ['husholdning', 'Husholdning'],
  ['andet', 'Andet'],
] as const;

export type Category = (typeof CATEGORIES)[number][0];

// Første regel, der passer, vinder. Rækkefølgen betyder noget: "kødboller" er kød,
// ikke brød, og "hvidløgsdressing" er en dressing, ikke en grøntsag.
// \b virker kun med a-z, så ord med æ, ø og å afgrænses med mellemrum.
const RULES: [Category, RegExp][] = [
  ['husholdning', /bleer|toiletpapir|køkkenrulle|opvask|vaskemiddel|sæbe|tandpasta|shampoo|affaldspose|bagepapir|folie|rengøring|vådservietter/],
  ['frost', /frost|fiskefingre|pomfrit|fritter|wokgrønt|edamame|nuggets|kyllingepops|kyllingebites|ærter|\bis\b|isvafler/],
  ['kolonial', /chips|nachos|taco|dressing|remoulade|mayo|ketchup|salsa|pesto|sauce|sovs|bouillon|syltetøj|gochujang|soja|sennep/],
  ['koed_fisk', /kylling|okse|svin|kød|hakket|bacon|chorizo|pølse|skinke|laks|fisk|\btun|rejer|kuller|mørbrad|spareribs|kotelet|medister|flæsk|andebryst|andelår|andesteg|\blam\b|deller|gullasch|flødekartofler|\bdej\b|mørdej|pizzadej|tortellini|hummus/],
  ['mejeri', /ost\b|ost-|ost$|hytteost|fløde|mælk|smør|yoghurt|skyr|tzatziki|(?:^|\s)æg(?:$|\s)|spejlæg|creme|cheddar|parmesan|feta|bechamel|mozzarella/],
  ['broed', /brød|boller|bolle|pita|wraps|tortilla|tarteletter|pandekager|rasp/],
  ['frugt_groent', /agurk|ananas|asparges|avocado|basilikum|broccoli|champignon|svampe|chili|jalapenos|citron|coleslaw|gulerod|gulerødder|kål|hvidløg|ingefær|iceberg|jordskok|kartof|lime|løg|majs|mango|paprika|peberfrugt|persille|porre|purløg|rodfrugt|salat|spinat|timian|tomat|krydderurt|melon|æble|banan|pære|grøntsager|grønne bønner|squash|blomkål|grønkål|appelsin|druer|jordbær/],
  ['drikke', /\bvand\b|sodavand|juice|(?:^|\s)øl(?:$|\s)|vin\b|vin |kaffe|\bte\b|saft|cola/],
  ['kolonial', /ris|pasta|spaghetti|nudler|bulgur|quinoa|orzo|suppehorn|lasagneplader|bønner|mel|gær|krydderi|karry|oregano|safran|kapers|oliven|peanuts|sesamfrø|nori|havregryn|sukker|olie|eddike|salt|peber|tun\b|dåse|fyld/],
];

/** Den gang i butikken, en vare typisk står i. Ukendte varer havner i fallback. */
export function categoryOf(name: string, fallback: Category = 'andet'): Category {
  const n = name.toLowerCase().trim();
  return RULES.find(([, re]) => re.test(n))?.[0] ?? fallback;
}

/** "hvidvin (kan udelades)" bliver til "Hvidvin". */
export function cleanName(name: string): string {
  const n = name.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export const keyOf = (name: string) => name.trim().toLowerCase();

export type PlanDay = {
  /** 1 = mandag. */
  weekday: number;
  ingredients: string[];
};

export type Staple = { name: string; category: Category };

export type WantedItem = {
  name: string;
  category: Category;
  source: 'plan' | 'staple';
  /** Hvilke dage varen skal bruges, fx "mandag og torsdag". */
  note: string;
};

const DAYS = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];

function joinDays(days: number[]): string {
  const list = [...new Set(days)].sort((a, b) => a - b).map((d) => DAYS[d - 1]);
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} og ${list[list.length - 1]}`;
}

/**
 * Varerne til ugens aftensmad og de faste varer. En vare, der bruges flere dage,
 * står der én gang med alle dagene. En fast vare, der også er i planen, står der
 * én gang som fast vare.
 */
export function buildList(days: PlanDay[], staples: Staple[]): WantedItem[] {
  const byKey = new Map<string, { name: string; days: number[] }>();
  for (const day of days) {
    for (const raw of day.ingredients) {
      const name = cleanName(raw);
      if (!name) continue;
      const entry = byKey.get(keyOf(name)) ?? { name, days: [] };
      entry.days.push(day.weekday);
      byKey.set(keyOf(name), entry);
    }
  }

  const items: WantedItem[] = [];
  const stapleKeys = new Set<string>();
  for (const staple of staples) {
    const name = cleanName(staple.name);
    if (!name || stapleKeys.has(keyOf(name))) continue;
    stapleKeys.add(keyOf(name));
    const planned = byKey.get(keyOf(name));
    items.push({ name, category: staple.category, source: 'staple', note: planned ? joinDays(planned.days) : '' });
  }
  for (const [key, entry] of byKey) {
    if (stapleKeys.has(key)) continue;
    items.push({ name: entry.name, category: categoryOf(entry.name, 'kolonial'), source: 'plan', note: joinDays(entry.days) });
  }
  return items;
}

/** Sorterer efter butikkens gange og derefter navn. */
export function byAisle<T extends { name: string; category: string }>(items: T[]): T[] {
  const order = new Map<string, number>(CATEGORIES.map(([c], i) => [c, i]));
  return [...items].sort(
    (a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || a.name.localeCompare(b.name, 'da'),
  );
}

// Erstatninger med samme rolle i retten. Mest specifikke først.
const SUBSTITUTES: [RegExp, string][] = [
  [/røget laks/, 'Røget ørred'],
  [/laks/, 'Ørredfilet'],
  [/kyllingelår/, 'Kyllingeoverlår'],
  [/kyllingebryst|kyllingefilet/, 'Kyllingeinderfilet'],
  [/hakket kylling|kyllingefars/, 'Hakket kalkun'],
  [/hakket oksekød|hakket svinekød|hakket kød/, 'Hakket svin og kalv'],
  [/oksekød i strimler/, 'Svinekød i strimler'],
  [/svinekød i strimler/, 'Kyllingestrimler'],
  [/mørbrad/, 'Svinekam'],
  [/kuller|fiskefilet/, 'Torskefilet'],
  [/bacon/, 'Skinkestrimler'],
  [/broccoli/, 'Blomkål'],
  [/spidskål/, 'Hvidkål'],
  [/spinat/, 'Grønkål'],
  [/peberfrugt/, 'Squash'],
  [/champignon|svampe/, 'Blandede svampe'],
  [/lime/, 'Citron'],
  [/citron/, 'Lime'],
  [/persille/, 'Purløg'],
  [/parmesan/, 'Grana Padano'],
  [/feta/, 'Salatost'],
  [/salatost/, 'Feta'],
  [/cheddar/, 'Revet mozzarella'],
  [/fløde/, 'Madlavningsfløde'],
  [/tortilla|wraps/, 'Pitabrød'],
  [/pitabrød|pita/, 'Tortillas'],
  [/burgerbolle/, 'Sandwichboller'],
  [/spaghetti/, 'Anden pasta'],
  [/ris\b/, 'Bulgur'],
];

/** En anden vare med samme rolle i retten, eller null hvis Madro ikke kender en. */
export function substituteFor(name: string): string | null {
  const n = name.toLowerCase();
  return SUBSTITUTES.find(([re]) => re.test(n))?.[1] ?? null;
}

/**
 * Er varen rettens hovedingrediens? Så giver det mere mening at bytte retten
 * end at finde en erstatning.
 */
export function isMainIngredient(name: string, mainProtein: string): boolean {
  const item = keyOf(name);
  const main = keyOf(mainProtein);
  if (!item || !main) return false;
  return main.split(/,| og | eller /).some((part) => {
    const p = part.trim();
    return p.length > 2 && (item.includes(p) || p.includes(item));
  });
}
