import { supabase } from '@/lib/supabase';
import type { PantryItem, Place } from '@/pantry/pantry';

export async function fetchPantry(householdId: string): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('id, name, place, expires_on')
    .eq('household_id', householdId)
    .order('expires_on', { nullsFirst: false });
  if (error) throw error;
  return data as PantryItem[];
}

export async function addPantryItem(householdId: string, name: string, place: Place, expiresOn: string | null): Promise<void> {
  const { error } = await supabase.from('pantry_items').insert({ household_id: householdId, name, place, expires_on: expiresOn });
  if (error) throw error;
}

/** Varen er brugt op eller smidt ud. */
export async function removePantryItem(id: string): Promise<void> {
  const { error } = await supabase.from('pantry_items').delete().eq('id', id);
  if (error) throw error;
}
