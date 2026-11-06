import { errorText } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export type RecipeStep = { text: string; timer_seconds: number | null };

export type Recipe = {
  title: string;
  servings: number | null;
  ingredients: string[];
  steps: RecipeStep[];
};

export type SavedRecipe = Recipe & { id: string; source_url: string | null };

/** Opskriften til en ret i husstanden, hvis den er gemt. */
export async function fetchRecipe(householdId: string, dishId: string): Promise<SavedRecipe | null> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, source_url, servings, ingredients, steps')
    .eq('household_id', householdId)
    .eq('dish_id', dishId)
    .maybeSingle();
  if (error) throw error;
  return data as SavedRecipe | null;
}

/** Beder funktionen læse opskriften på et link. Gemmer ingenting. */
export async function importRecipe(householdId: string, url: string): Promise<Recipe> {
  const { data, error } = await supabase.functions.invoke('import-recipe', { body: { household_id: householdId, url } });
  if (error) throw error;
  return (data as { recipe: Recipe }).recipe;
}

/** Gemmer opskriften til retten. Har retten en, skal den slettes først. */
export async function saveRecipe(householdId: string, dishId: string, url: string, recipe: Recipe): Promise<void> {
  const { error } = await supabase.from('recipes').insert({
    household_id: householdId,
    dish_id: dishId,
    title: recipe.title,
    source_url: url,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
  });
  if (error) throw error;
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

/** Fejlkoderne fra funktionen som tekst. */
export async function importError(e: unknown): Promise<string> {
  const response = (e as { context?: Response }).context;
  const body = response?.json ? await response.json().catch(() => null) : null;
  switch (body?.error) {
    case 'invalid_request':
      return 'Linket skal være en almindelig adresse, der starter med https://.';
    case 'page_unreachable':
      return 'Madro kunne ikke åbne siden. Tjek linket, eller prøv en anden side.';
    case 'no_recipe_found':
      return 'Madro fandt ingen opskrift på siden. Prøv linket direkte til selve opskriften.';
    default:
      return errorText(e);
  }
}
