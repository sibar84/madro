// Læser husstandens kalender og giver ugens travle aftener tilbage.
//
// Kaldes af appen med { household_id, week_start }. Funktionen tjekker selv brugerens
// login og at brugeren er voksen i husstanden. Kalenderlinket ligger i databasen og
// forlader aldrig funktionen: appen får kun at vide, hvilke dage (1 = mandag) der er travle.
// Aftalernes indhold gemmes ikke og sendes ikke videre.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { fetchText, safeUrl } from '../_shared/net.ts';
import { busyDays } from './ical.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const week = typeof body.week_start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start) ? body.week_start : null;
  if (typeof body.household_id !== 'string' || !week) return json({ error: 'invalid_request' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return json({ error: 'not_authenticated' }, 401);

  const { data: member } = await admin
    .from('memberships')
    .select('role')
    .eq('household_id', body.household_id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!member || !['owner', 'adult'].includes(member.role)) return json({ error: 'not_found' }, 404);

  const { data: link } = await admin.from('calendar_links').select('url').eq('household_id', body.household_id).maybeSingle();
  if (!link) return json({ error: 'no_calendar' }, 422);
  const url = safeUrl(link.url);
  if (!url) return json({ error: 'calendar_unreachable' }, 422);

  let text: string | null;
  try {
    text = await fetchText(url, {
      accept: 'text/calendar,text/plain,*/*',
      agent: 'Madro kalenderlæser',
      types: ['calendar', 'text/plain', 'octet-stream'],
      maxBytes: 8_000_000,
    });
  } catch (e) {
    console.error('read-calendar hent', e instanceof Error ? e.message : e);
    return json({ error: 'calendar_unreachable' }, 422);
  }
  if (!text || !text.includes('BEGIN:VCALENDAR')) return json({ error: 'calendar_unreachable' }, 422);

  return json({ busy_days: busyDays(text, week) });
});
