import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { errorText } from '@/lib/errors';
import { deleteRecipe, fetchRecipe, importError, importRecipe, saveRecipe, type Recipe, type SavedRecipe } from '@/lib/recipes';
import { useHousehold } from '@/providers/household';

/** Opskriften til dagens ret: hent den fra et link, gem den, og gå i gang med madlavningstilstanden. */
export function RecipeCard({ dishId, dishName }: { dishId: string; dishName: string }) {
  const router = useRouter();
  const { household } = useHousehold();
  const [saved, setSaved] = useState<SavedRecipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!household) return;
    fetchRecipe(household.id, dishId)
      .then(setSaved)
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [household, dishId]);

  useEffect(load, [load]);

  async function onFetch() {
    if (!household) return;
    setBusy(true);
    setError(null);
    try {
      setDraft(await importRecipe(household.id, url));
    } catch (e) {
      setError(await importError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!household || !draft) return;
    setBusy(true);
    setError(null);
    try {
      await saveRecipe(household.id, dishId, url.trim(), draft);
      setDraft(null);
      setUrl('');
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!saved) return;
    setBusy(true);
    setError(null);
    try {
      await deleteRecipe(saved.id);
      setSaved(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <ThemedView type="card" style={styles.card}>
      <ThemedText type="head">Opskrift</ThemedText>

      {saved ? (
        <>
          <ThemedText>
            {saved.title}: {saved.ingredients.length} ingredienser og {saved.steps.length} trin.
          </ThemedText>
          <Button title="Lav mad" onPress={() => router.navigate('/lav-mad')} />
          <Button title="Fjern opskriften" variant="secondary" onPress={onRemove} loading={busy} />
        </>
      ) : draft ? (
        <>
          <ThemedText type="title">{draft.title}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {draft.ingredients.length} ingredienser og {draft.steps.length} trin
            {draft.servings ? `, til ${draft.servings} personer` : ''}.
          </ThemedText>
          <ThemedText type="foot" themeColor="textSecondary">
            Tjek, at det ligner opskriften. Gemmes den, bliver den opskriften til {dishName}.
          </ThemedText>
          <Button title="Gem til retten" onPress={onSave} loading={busy} />
          <Button title="Prøv et andet link" variant="secondary" onPress={() => setDraft(null)} />
        </>
      ) : (
        <>
          <ThemedText themeColor="textSecondary">
            Sæt et link ind til opskriften på {dishName}, så får du den trin for trin med timere.
          </ThemedText>
          <TextField
            label="Link til opskriften"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://"
          />
          <View>
            <Button title="Hent opskrift" onPress={onFetch} loading={busy} disabled={url.trim().length < 8} />
          </View>
        </>
      )}

      {error && (
        <ThemedText themeColor="bad" accessibilityRole="alert">
          {error}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
