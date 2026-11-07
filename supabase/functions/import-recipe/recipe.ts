// Gør en opskrift fra en hjemmeside til ingredienser og trin.
//
// De fleste opskriftssider skriver opskriften som strukturerede data (JSON-LD),
// som læses direkte uden en sprogmodel. Filen må ikke importere andre filer,
// så testene kan køre direkte, bortset fra de fælles adresseregler nederst.

export type Step = { text: string; timer_seconds: number | null };

export type Recipe = {
  title: string;
  servings: number | null;
  ingredients: string[];
  steps: Step[];
};

export const MAX_INGREDIENTS = 80;
export const MAX_STEPS = 60;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aring: 'å', Aring: 'Å', oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ' };

/** Fjerner tags og skriver HTML-tegn som tekst. */
export function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Første tidsangivelse i et trin, i sekunder. "20-25 minutter" giver 25 minutter. */
export function timerOf(text: string): number | null {
  const match = text.match(/(\d+)(?:\s*[-–]\s*(\d+))?\s*(minutter|minutes|min\b|timer|time\b|hours?|hrs?\b|t\b)/i);
  if (!match) return null;
  const amount = Number(match[2] ?? match[1]);
  const unit = match[3].toLowerCase();
  const seconds = amount * (/^(m)/.test(unit) ? 60 : 3600);
  return seconds >= 60 && seconds <= 6 * 3600 ? seconds : null;
}

function nodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return [obj, ...nodes(obj['@graph'])];
  }
  return [];
}

function isRecipe(node: Record<string, unknown>): boolean {
  const type = node['@type'];
  return Array.isArray(type) ? type.includes('Recipe') : type === 'Recipe';
}

function stepTexts(value: unknown): string[] {
  if (typeof value === 'string') {
    // Nogle sider skriver alle trin i én tekst, ét trin pr. linje.
    return value.split(/\r?\n|<br\s*\/?>|<\/p>|<\/li>/i).map(plain).filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap(stepTexts);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.itemListElement) return stepTexts(obj.itemListElement);
    if (typeof obj.text === 'string') return stepTexts(obj.text);
    if (typeof obj.name === 'string') return stepTexts(obj.name);
  }
  return [];
}

function servingsOf(value: unknown): number | null {
  const first = Array.isArray(value) ? value[0] : value;
  const n = typeof first === 'number' ? first : Number(String(first ?? '').match(/\d+/)?.[0]);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

/** Bygger en opskrift af rå tekster. Bruges også til sprogmodellens svar. */
export function toRecipe(title: unknown, servings: unknown, ingredients: unknown, steps: unknown): Recipe | null {
  const list = (value: unknown) => (Array.isArray(value) ? value : []).flatMap((v) => (typeof v === 'string' ? [plain(v)] : [])).filter(Boolean);
  const cleanSteps = stepTexts(steps).slice(0, MAX_STEPS).map((text) => ({ text: text.slice(0, 600), timer_seconds: timerOf(text) }));
  const cleanIngredients = list(ingredients).slice(0, MAX_INGREDIENTS).map((i) => i.slice(0, 200));
  const name = typeof title === 'string' ? plain(title).slice(0, 120) : '';
  if (!name || cleanIngredients.length === 0 || cleanSteps.length === 0) return null;
  return { title: name, servings: servingsOf(servings), ingredients: cleanIngredients, steps: cleanSteps };
}

/** Finder opskriften i sidens strukturerede data. */
export function fromJsonLd(html: string): Recipe | null {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    for (const node of nodes(data)) {
      if (!isRecipe(node)) continue;
      const recipe = toRecipe(node.name, node.recipeYield, node.recipeIngredient, node.recipeInstructions);
      if (recipe) return recipe;
    }
  }
  return null;
}

/** Siden som ren tekst, så en sprogmodel kan læse opskriften, når siden ikke har strukturerede data. */
export function pageText(html: string, max = 30000): string {
  return plain(html.replace(/<(script|style|nav|footer|header|svg)[\s\S]*?<\/\1>/gi, ' ')).slice(0, max);
}

export { isPrivateAddress, safeUrl } from '../_shared/net.ts';
