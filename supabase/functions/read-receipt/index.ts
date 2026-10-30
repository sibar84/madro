// Læser et kvitteringsbillede med Claude og gemmer butik, dato, total og linjer.
//
// Kaldes af appen med { receipt_id } lige efter, billedet er lagt i lageret.
// Funktionen tjekker selv brugerens login og at brugeren hører til
// kvitteringens husstand, før den henter billedet og skriver linjerne.
// Nøglerne til Claude og Supabase findes kun her og aldrig i appen.

import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { INSTRUCTIONS, RECEIPT_SCHEMA, toRows, type ReadReceipt } from './receipt.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'not_configured' }, 503);

  const { receipt_id } = await req.json().catch(() => ({}));
  if (typeof receipt_id !== 'string') return json({ error: 'invalid_request' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return json({ error: 'not_authenticated' }, 401);

  // Kvitteringen skal findes og høre til en husstand, brugeren er medlem af.
  const { data: receipt } = await admin
    .from('receipts')
    .select('id, household_id, image_path, status')
    .eq('id', receipt_id)
    .maybeSingle();
  const { data: member } = receipt
    ? await admin
        .from('memberships')
        .select('user_id')
        .eq('household_id', receipt.household_id)
        .eq('user_id', auth.user.id)
        .maybeSingle()
    : { data: null };
  if (!receipt || !member) return json({ error: 'not_found' }, 404);
  if (receipt.status === 'done') return json({ status: 'done' });

  const fail = async (error: string) => {
    await admin.from('receipts').update({ status: 'failed', error }).eq('id', receipt.id);
    return json({ status: 'failed', error });
  };

  const { data: image, error: downloadError } = await admin.storage.from('receipts').download(receipt.image_path);
  if (downloadError || !image) return fail('image_missing');
  const mediaType = receipt.image_path.endsWith('.png') ? 'image/png' : 'image/jpeg';

  let read: ReadReceipt;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: RECEIPT_SCHEMA } },
      system: INSTRUCTIONS,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: toBase64(new Uint8Array(await image.arrayBuffer())) },
            },
            { type: 'text', text: 'Læs kvitteringen.' },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal') return fail('refused');
    if (response.stop_reason === 'max_tokens') return fail('too_long');
    const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    read = JSON.parse(text) as ReadReceipt;
  } catch (e) {
    console.error('read-receipt', e instanceof Error ? e.message : e);
    return fail('unreadable');
  }

  const rows = toRows(read);
  if (rows.lines.length === 0) return fail('no_lines');

  // Linjerne erstattes, så et nyt forsøg ikke giver dubletter.
  await admin.from('receipt_lines').delete().eq('receipt_id', receipt.id);
  const { error: insertError } = await admin.from('receipt_lines').insert(
    rows.lines.map((line) => ({ ...line, receipt_id: receipt.id, household_id: receipt.household_id })),
  );
  if (insertError) return fail('save_failed');

  await admin
    .from('receipts')
    .update({ status: 'done', error: null, store: rows.store, purchased_on: rows.purchased_on, total: rows.total })
    .eq('id', receipt.id);

  return json({ status: 'done', lines: rows.lines.length, uncertain: rows.lines.filter((l) => !l.certain).length });
});
