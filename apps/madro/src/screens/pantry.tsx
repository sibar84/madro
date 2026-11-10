import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { errorText } from '@/lib/errors';
import { today } from '@/lib/meal-plan';
import { addPantryItem, fetchPantry, removePantryItem } from '@/lib/pantry';
import { cleanName, daysLeft, expiryLabel, inDays, PLACES, SHELF, sortPantry, type PantryItem, type Place } from '@/pantry/pantry';
import { useHousehold } from '@/providers/household';

/** Lageret: hvad der er i køleskab, fryser og skab, og hvad der skal bruges først. */
export function Pantry() {
  const { household } = useHousehold();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [name, setName] = useState('');
  const [place, setPlace] = useState<Place>('koleskab');
  const [shelf, setShelf] = useState<number | null>(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const date = today();

  const load = useCallback(() => {
    if (!household) return;
    fetchPantry(household.id)
      .then(setItems)
      .catch((e) => setError(errorText(e)));
  }, [household]);

  useFocusEffect(load);

  async function onAdd() {
    const clean = cleanName(name);
    if (!household || !clean) return;
    setBusy(true);
    setError(null);
    try {
      await addPantryItem(household.id, clean, place, shelf === null ? null : inDays(date, shelf));
      setName('');
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(item: PantryItem) {
    const before = items;
    setItems(items.filter((i) => i.id !== item.id));
    try {
      await removePantryItem(item.id);
    } catch (e) {
      setItems(before);
      setError(errorText(e));
    }
  }

  const sorted = sortPantry(items, date);

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        Skriv, hvad der er i huset, og hvor længe det holder. Det, der skal bruges snart, står øverst og på Køkken.
      </ThemedText>

      <ThemedView type="card" style={styles.card}>
        <TextField label="Vare" value={name} onChangeText={setName} onSubmitEditing={onAdd} placeholder="Fx hakket oksekød" />
        <ChipRow>
          {PLACES.map(([code, label]) => (
            <Chip key={code} label={label} selected={place === code} onPress={() => setPlace(code)} />
          ))}
        </ChipRow>
        <ThemedText type="sub" themeColor="textSecondary">
          Holder
        </ThemedText>
        <ChipRow>
          {SHELF.map(([label, days]) => (
            <Chip key={label} label={label} selected={shelf === days} onPress={() => setShelf(days)} />
          ))}
        </ChipRow>
        <View>
          <Button title="Læg i lageret" onPress={onAdd} loading={busy} disabled={!name.trim()} />
        </View>
      </ThemedView>

      {sorted.length === 0 ? (
        <ThemedText themeColor="textSecondary">Lageret er tomt.</ThemedText>
      ) : (
        <ThemedView type="card" style={styles.card}>
          {sorted.map((item) => {
            const left = daysLeft(item, date);
            const soon = left !== null && left <= 1;
            return (
              <View key={item.id} style={styles.row}>
                <View style={styles.grow}>
                  <ThemedText>{item.name}</ThemedText>
                  <ThemedText type="foot" themeColor={soon ? 'bad' : 'textSecondary'}>
                    {PLACES.find(([c]) => c === item.place)?.[1]} · {expiryLabel(item, date)}
                  </ThemedText>
                </View>
                <Button
                  title="Brugt"
                  variant="secondary"
                  accessibilityLabel={`${item.name} er brugt eller smidt ud`}
                  onPress={() => onRemove(item)}
                />
              </View>
            );
          })}
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
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  grow: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
