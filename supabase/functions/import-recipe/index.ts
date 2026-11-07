// Henter en opskrift fra et link og giver den tilbage som ingredienser og trin.
//
// Kaldes af appen med { household_id, url }. Funktionen tjekker selv brugerens
// login og medlemskab. Den gemmer ingenting: appen viser opskriften, og brugeren
// vælger at gemme den. Strukturerede data på siden læses direkte; findes de ikke,
// læser Claude sidens tekst. Nøglen til Claude findes kun her og aldrig i appen.

import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { fetchText } from '../_shared/net.ts';
import { fromJsonLd, pageText, safeUrl, toRecipe, type Recipe } from './recipe.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_BYTES = 2_000_000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    servings: { type: ['integer', 'null'] },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'servings', 'ingredients', 'steps'],
  additionalProperties: false,
};

const INSTRUCTIONS =
  'Du får teksten fra en hjemmeside. Find opskriften på siden og skriv den af som den står: titel, antal personer, ' +
  'ingredienser (én pr. linje, med mængde) og fremgangsmåde (ét trin pr. punkt). Skriv på sidens eget sprog. ' +
  'Opfind ingenting. Findes der ingen opskrift på siden, så svar med tomme lister.';

function fetchPage(url: URL): Promise<string | null> {
  return fetchText(url, {
    accept: 'text/html,application/xhtml+xml',
    agent: 'Madro opskriftslæser',
    types: ['html'],
    maxBytes: MAX_BYTES,
  });
}

async function readWithClaude(apiKey: string, html: string): Promise<Recipe | null> {
  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: INSTRUCTIONS,
    messages: [{ role: 'user', content: pageText(html) }],
  });
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
  const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  const read = JSON.parse(text) as { title: string; servings: number | null; ingredients: string[]; steps: string[] };
  return toRecipe(read.title, read.servings, read.ingredients, read.steps);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === 'string' ? safeUrl(body.url) : null;
  if (typeof body.household_id !== 'string' || !url) return json({ error: 'invalid_request' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return json({ error: 'not_authenticated' }, 401);

  const { data: member } = await admin
    .from('memberships')
    .select('user_id')
    .eq('household_id', body.household_id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!member) return json({ error: 'not_found' }, 404);

  let html: string | null;
  try {
    html = await fetchPage(url);
  } catch (e) {
    console.error('import-recipe hent', e instanceof Error ? e.message : e);
    return json({ error: 'page_unreachable' }, 422);
  }
  if (!html) return json({ error: 'page_unreachable' }, 422);

  const direct = fromJsonLd(html);
  if (direct) return json({ recipe: direct, source: 'page' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'no_recipe_found' }, 422);
  try {
    const recipe = await readWithClaude(apiKey, html);
    return recipe ? json({ recipe, source: 'claude' }) : json({ error: 'no_recipe_found' }, 422);
  } catch (e) {
    console.error('import-recipe claude', e instanceof Error ? e.message : e);
    return json({ error: 'no_recipe_found' }, 422);
  }
});
