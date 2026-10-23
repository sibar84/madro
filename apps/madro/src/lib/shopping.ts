import { supabase } from '@/lib/supabase';
import type { Category, Staple, WantedItem } from '@/shopping/list';
import type { Op, ShoppingItem } from '@/shopping/queue';

export type StapleRow = Staple & { id: string };

const ITEM_COLUMNS = 'id, name, category, source, note, checked_at, checked_by, sold_out, replaced_from, removed_at';

export async function fetchShoppingItems(householdId: string, weekStart: string): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from('shopping_items')
    .select(ITEM_COLUMNS)
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
    .order('created_at');
  if (error) throw error;
  return data as ShoppingItem[];
}

export async function fetchStaples(householdId: string): Promise<StapleRow[]> {
  const { data, error } = await supabase
    .from('staples')
    .select('id, name, category')
    .eq('household_id', householdId)
    .order('name');
  if (error) throw error;
  return data as StapleRow[];
}

export async function addStaple(householdId: string, name: string, category: Category): Promise<void> {
  const { error } = await supabase.from('staples').insert({ household_id: householdId, name, category });
  if (error) throw error;
}

export async function removeStaple(id: string): Promise<void> {
  const { error } = await supabase.from('staples').delete().eq('id', id);
  if (error) throw error;
}

export async function syncShoppingList(householdId: string, weekStart: string, items: WantedItem[]): Promise<void> {
  const { error } = await supabase.rpc('sync_shopping_list', {
    p_household: householdId,
    p_week_start: weekStart,
    p_items: items,
  });
  if (error) throw error;
}

/** Sender én ventende ændring. */
export async function sendOp(op: Op): Promise<void> {
  if (op.kind === 'update') {
    const { error } = await supabase.from('shopping_items').update(op.changes).eq('id', op.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('shopping_items').insert({
    id: op.id,
    household_id: op.household,
    week_start: op.week,
    name: op.name,
    category: op.category,
  });
  // Varen findes allerede, måske fjernet. Så tages den frem igen.
  if (error?.code === '23505') {
    const { error: again } = await supabase
      .from('shopping_items')
      .update({ removed_at: null, checked_at: null, sold_out: false })
      .eq('household_id', op.household)
      .eq('week_start', op.week)
      .eq('key', op.name.trim().toLowerCase());
    if (again) throw again;
    return;
  }
  if (error) throw error;
}
