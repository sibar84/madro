import { supabase } from '@/lib/supabase';
import { addDays, type Dish, type Person, type PlannedDay, type ReasonCode } from '@/planner/engine';

export type CatalogDish = Dish & {
  vegetables: string;
  recipe_url: string | null;
  note: string;
};

/** En person i familien. Børn har ingen konto (user_id er null). */
export type FamilyMember = Person & { user_id: string | null };

export type WeekPlan = {
  weekStart: string;
  busyDays: number[];
  days: PlannedDay[];
};

/** Hvor mange uger tilbage en ret tæller som "spist for nylig". */
const RECENT_WEEKS = 3;

/** Dagens dato i telefonens tidszone, YYYY-MM-DD. */
export function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export async function fetchPersons(householdId: string): Promise<FamilyMember[]> {
  const { data, error } = await supabase
    .from('persons')
    .select('id, display_name, birth_year, allergies, dislikes, away_days, user_id')
    .eq('household_id', householdId)
    .order('created_at');
  if (error) throw error;
  return data as FamilyMember[];
}

export async function fetchDishes(): Promise<CatalogDish[]> {
  const { data, error } = await supabase
    .from('dishes')
    .select(
      'id, name, main_protein, protein_tags, vegetables, ingredients, allergens, kid_friendly, kid_favorite, effort, months, recipe_url, note',
    )
    .order('name');
  if (error) throw error;
  return data as CatalogDish[];
}

type PlanRow = {
  week_start: string;
  busy_days: number[];
  plan_days: { day: string; dish_id: string; reasons: ReasonCode[]; eaters: string[] }[];
};

/** Ugens plan med alle syv dage. Dage uden ret har dishId null. Null hvis ugen ikke er planlagt. */
export async function fetchWeekPlan(householdId: string, weekStart: string): Promise<WeekPlan | null> {
  const { data, error } = await supabase
    .from('week_plans')
    .select('week_start, busy_days, plan_days (day, dish_id, reasons, eaters)')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
    .maybeSingle<PlanRow>();
  if (error) throw error;
  if (!data) return null;

  const days = Array.from({ length: 7 }, (_, i): PlannedDay => {
    const date = addDays(weekStart, i);
    const saved = data.plan_days.find((d) => d.day === date);
    return {
      date,
      weekday: i + 1,
      dishId: saved?.dish_id ?? null,
      reasons: saved?.reasons ?? ['ingen_hjemme'],
      eaters: saved?.eaters ?? [],
    };
  });
  return { weekStart, busyDays: data.busy_days, days };
}

/** Retter fra ugerne før, så de ikke kommer igen med det samme. */
export async function fetchRecentDishIds(householdId: string, weekStart: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('plan_days')
    .select('dish_id')
    .eq('household_id', householdId)
    .gte('day', addDays(weekStart, -7 * RECENT_WEEKS))
    .lt('day', weekStart);
  if (error) throw error;
  return data.map((d: { dish_id: string }) => d.dish_id);
}

export async function saveWeekPlan(householdId: string, plan: WeekPlan): Promise<void> {
  const { error } = await supabase.rpc('save_week_plan', {
    p_household: householdId,
    p_week_start: plan.weekStart,
    p_busy_days: plan.busyDays,
    p_days: plan.days
      .filter((d) => d.dishId)
      .map((d) => ({ day: d.date, dish_id: d.dishId, reasons: d.reasons, eaters: d.eaters })),
  });
  if (error) throw error;
}
