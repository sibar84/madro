import { newId } from '@/shopping/queue';
import { supabase } from '@/lib/supabase';

export type ReceiptLine = {
  id: string;
  text: string;
  amount: number;
  category: string;
  certain: boolean;
  confirmed_at: string | null;
};

export type Receipt = {
  id: string;
  store: string;
  purchased_on: string | null;
  total: number | null;
  status: 'reading' | 'done' | 'failed';
  error: string | null;
  created_at: string;
  receipt_lines: ReceiptLine[];
};

/** Kategorierne på en kvittering: butikkens gange plus det, der ikke er mad. */
export const RECEIPT_CATEGORIES = [
  ['frugt_groent', 'Frugt og grønt'],
  ['broed', 'Brød'],
  ['koed_fisk', 'Kød, fisk og køl'],
  ['mejeri', 'Mejeri og æg'],
  ['kolonial', 'Kolonial'],
  ['frost', 'Frost'],
  ['drikke', 'Drikkevarer'],
  ['husholdning', 'Husholdning'],
  ['andet', 'Andet'],
  ['ikke_mad', 'Ikke mad'],
] as const;

export async function saveHouseholdSettings(
  householdId: string,
  settings: { dinner_time: string; food_budget: number | null; payday: number },
): Promise<void> {
  const { error } = await supabase.rpc('update_household_settings', {
    p_household: householdId,
    p_dinner_time: settings.dinner_time,
    p_food_budget: settings.food_budget,
    p_payday: settings.payday,
  });
  if (error) throw error;
}

/** De seneste kvitteringer med deres linjer, nyeste først. */
export async function fetchReceipts(householdId: string): Promise<Receipt[]> {
  const { data, error } = await supabase
    .from('receipts')
    .select('id, store, purchased_on, total, status, error, created_at, receipt_lines (id, text, amount, category, certain, confirmed_at)')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as Receipt[]).map((r) => ({
    ...r,
    total: r.total === null ? null : Number(r.total),
    receipt_lines: r.receipt_lines.map((l) => ({ ...l, amount: Number(l.amount) })),
  }));
}

function bytesOf(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^,]*,/, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Lægger billedet i husstandens mappe, opretter kvitteringen og beder
 * edge-funktionen læse den. Returnerer, når kvitteringen er læst eller fejlede.
 */
export async function scanReceipt(householdId: string, image: { base64: string; mimeType?: string | null }): Promise<string> {
  const id = newId();
  const png = image.mimeType === 'image/png';
  const path = `${householdId}/${id}.${png ? 'png' : 'jpg'}`;
  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, bytesOf(image.base64), { contentType: png ? 'image/png' : 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('receipts').insert({ id, household_id: householdId, image_path: path });
  if (error) throw error;

  await readReceipt(id);
  return id;
}

/** Læser kvitteringen (igen). Fejl gemmes på kvitteringen, så de kan vises. */
export async function readReceipt(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke('read-receipt', { body: { receipt_id: id } });
  if (error) throw error;
}

export async function confirmLine(id: string, category: string): Promise<void> {
  const { error } = await supabase
    .from('receipt_lines')
    .update({ category, confirmed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteReceipt(id: string): Promise<void> {
  const { error } = await supabase.from('receipts').delete().eq('id', id);
  if (error) throw error;
}

/** Fejlkoderne fra edge-funktionen som tekst. */
export function receiptError(code: string | null): string {
  switch (code) {
    case 'not_configured':
      return 'Kvitteringslæsning er ikke slået til endnu.';
    case 'no_lines':
      return 'Madro fandt ingen varer på billedet. Tag et skarpere billede af hele kvitteringen.';
    case 'refused':
    case 'unreadable':
    case 'too_long':
      return 'Kvitteringen kunne ikke læses. Prøv igen, eller tag et nyt billede.';
    default:
      return 'Noget gik galt med kvitteringen. Prøv igen.';
  }
}
