import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Screen } from '@/components/screen';
import { ShoppingRow } from '@/components/shopping-row';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useShoppingList } from '@/hooks/use-shopping-list';
import { today } from '@/lib/meal-plan';
import { addDays, mondayOf } from '@/planner/engine';
import { useHousehold } from '@/providers/household';
import { byAisle, CATEGORIES, isMainIngredient, keyOf, substituteFor } from '@/shopping/list';

/** Ugens indkøbsliste, sorteret så I går gennem butikken én gang. */
export function Shopping() {
  const router = useRouter();
  const { household } = useHousehold();
  const thisWeek = mondayOf(today());
  const [weekStart, setWeekStart] = useState(thisWeek);
  const { items, plan, dishes, loading, offline, pending, error, add, update } = useShoppingList(weekStart);
  const [newItem, setNewItem] = useState('');
  const canEditStaples = household?.role === 'owner' || household?.role === 'adult';

  const visible = items.filter((i) => !i.removed_at);
  const toBuy = byAisle(visible.filter((i) => !i.checked_at));
  const inBasket = byAisle(visible.filter((i) => i.checked_at));
  const sections = CATEGORIES.map(([code, label]) => ({ label, items: toBuy.filter((i) => i.category === code) })).filter(
    (s) => s.items.length > 0,
  );

  // Retterne i planen, hvor varen er hovedingrediensen. Så kan retten byttes i stedet.
  const plannedDishes = (plan?.days ?? []).flatMap((d) => (d.dishId && dishes.get(d.dishId) ? [dishes.get(d.dishId)!] : []));
  const isMain = (name: string) =>
    plannedDishes.some(
      (dish) => isMainIngredient(name, dish.main_protein) && dish.ingredients.some((i) => keyOf(i) === keyOf(name)),
    );

  function onAdd() {
    add(newItem);
    setNewItem('');
  }

  const row = (item: (typeof visible)[number]) => (
    <ShoppingRow
      key={item.id}
      item={item}
      onChange={(changes) => update(item.id, changes)}
      substitute={substituteFor(item.name)}
      onSwapDish={item.source === 'plan' && isMain(item.name) ? () => router.navigate('/plan') : undefined}
    />
  );

  return (
    <Screen tabs>
      <ThemedText type="large">Indkøb</ThemedText>

      <ChipRow>
        <Chip label="Denne uge" selected={weekStart === thisWeek} onPress={() => setWeekStart(thisWeek)} />
        <Chip
          label="Næste uge"
          selected={weekStart !== thisWeek}
          onPress={() => setWeekStart(addDays(thisWeek, 7))}
        />
      </ChipRow>

      {(offline || pending > 0) && (
        <ThemedText type="sub" themeColor="textSecondary" accessibilityLiveRegion="polite">
          {offline
            ? 'Uden net. Listen virker stadig, og ændringerne sendes, når der er forbindelse.'
            : 'Sender ændringer …'}
        </ThemedText>
      )}

      <View style={styles.addRow}>
        <View style={styles.grow}>
          <TextField
            label="Tilføj en vare"
            value={newItem}
            onChangeText={setNewItem}
            onSubmitEditing={onAdd}
            returnKeyType="done"
            placeholder="Fx bananer"
          />
        </View>
        <Button title="Tilføj" variant="secondary" onPress={onAdd} disabled={!newItem.trim()} />
      </View>

      {loading && visible.length === 0 ? (
        <ActivityIndicator accessibilityLabel="Henter indkøbslisten" />
      ) : visible.length === 0 ? (
        <ThemedView type="card" style={styles.card}>
          <ThemedText type="title">Listen er tom</ThemedText>
          <ThemedText themeColor="textSecondary">
            {plan
              ? 'Tilføj det, I mangler, eller læg faste varer på, som skal med hver uge.'
              : 'Lav ugens plan, så kommer varerne til aftensmaden på listen her.'}
          </ThemedText>
          {!plan && <Button title="Lav ugens plan" onPress={() => router.navigate('/plan')} />}
        </ThemedView>
      ) : (
        <>
          {sections.map((section) => (
            <View key={section.label} style={styles.section}>
              <ThemedText type="cap" themeColor="textSecondary">
                {section.label}
              </ThemedText>
              {section.items.map(row)}
            </View>
          ))}
          {toBuy.length === 0 && (
            <ThemedText type="head" accessibilityRole="header">
              Alt er i kurven.
            </ThemedText>
          )}
          {inBasket.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="cap" themeColor="textSecondary">
                I kurven · {inBasket.length}
              </ThemedText>
              {inBasket.map(row)}
            </View>
          )}
        </>
      )}

      {error && (
        <ThemedText themeColor="bad" accessibilityRole="alert">
          {error}
        </ThemedText>
      )}

      {canEditStaples && (
        <Button title="Faste varer" variant="secondary" onPress={() => router.push('/faste-varer')} />
      )}
      <ThemedText type="foot" themeColor="textSecondary">
        Listen opdateres live for alle i husstanden. Varerne står i den rækkefølge, de fleste butikker har
        dem.
      </ThemedText>
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
    padding: Spacing.four,
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
});
