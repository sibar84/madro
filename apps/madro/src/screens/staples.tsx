import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { errorText } from '@/lib/errors';
import { addStaple, fetchStaples, removeStaple, type StapleRow } from '@/lib/shopping';
import { CATEGORIES, categoryOf, cleanName } from '@/shopping/list';
import { useHousehold } from '@/providers/household';

const label = (code: string) => CATEGORIES.find(([c]) => c === code)?.[1] ?? 'Andet';

/** Faste varer: det, der skal med hver uge, uanset hvad I spiser. */
export function Staples() {
  const { household } = useHousehold();
  const [staples, setStaples] = useState<StapleRow[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!household) return;
    fetchStaples(household.id)
      .then(setStaples)
      .catch((e) => setError(errorText(e)));
  }, [household]);

  useFocusEffect(load);

  async function onAdd() {
    const clean = cleanName(name);
    if (!household || !clean) return;
    setBusy(true);
    setError(null);
    try {
      await addStaple(household.id, clean, categoryOf(clean));
      setName('');
      load();
    } catch (e) {
      const err = e as { code?: string };
      setError(err.code === '23505' ? `${clean} er allerede en fast vare.` : errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(staple: StapleRow) {
    const before = staples;
    setStaples(staples.filter((s) => s.id !== staple.id));
    try {
      await removeStaple(staple.id);
    } catch (e) {
      setStaples(before);
      setError(errorText(e));
    }
  }

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        Faste varer kommer på indkøbslisten hver uge, fx mælk, rugbrød og bleer.
      </ThemedText>

      <View style={styles.addRow}>
        <View style={styles.grow}>
          <TextField label="Ny fast vare" value={name} onChangeText={setName} onSubmitEditing={onAdd} placeholder="Fx letmælk" />
        </View>
        <Button title="Tilføj" variant="secondary" onPress={onAdd} loading={busy} disabled={!name.trim()} />
      </View>

      {staples.length > 0 && (
        <ThemedView type="card" style={styles.card}>
          {staples.map((staple) => (
            <View key={staple.id} style={styles.row}>
              <View style={styles.grow}>
                <ThemedText>{staple.name}</ThemedText>
                <ThemedText type="foot" themeColor="textSecondary">
                  {label(staple.category)}
                </ThemedText>
              </View>
              <Button
                title="Fjern"
                variant="secondary"
                accessibilityLabel={`Fjern ${staple.name}`}
                onPress={() => onRemove(staple)}
              />
            </View>
          ))}
        </ThemedView>
      )}

      {error && (
        <ThemedText themeColor="bad" accessibilityRole="alert">
          {error}
        </ThemedText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  grow: {
    flex: 1,
  },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
