import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import type { CatalogDish, FamilyMember } from '@/lib/meal-plan';
import type { PlannedDay } from '@/planner/engine';
import { names, reasonText } from '@/planner/texts';

type MealDayProps = {
  label: string;
  day: PlannedDay;
  dish: CatalogDish | undefined;
  persons: FamilyMember[];
  onSwap?: () => void;
  swapping?: boolean;
};

/** Én dags aftensmad med begrundelser, hvem der spiser med, og knapper til at bytte og se opskriften. */
export function MealDay({ label, day, dish, persons, onSwap, swapping }: MealDayProps) {
  const eaters = persons.filter((p) => day.eaters.includes(p.id));
  const missing = persons.filter((p) => !day.eaters.includes(p.id));
  const reasons = day.reasons.map((r) => reasonText(r, eaters)).filter(Boolean);

  return (
    <ThemedView type="card" style={styles.card}>
      <ThemedText type="cap" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="title">{dish?.name ?? (day.dishId ? 'Retten findes ikke længere' : 'Ingen aftensmad')}</ThemedText>

      {reasons.length > 0 && (
        <ThemedText type="sub" themeColor="textSecondary">
          {reasons.join(' · ')}
        </ThemedText>
      )}
      {dish && missing.length > 0 && eaters.length > 0 && (
        <ThemedText type="sub" themeColor="textSecondary">
          Uden {names(missing)}
        </ThemedText>
      )}
      {dish?.note ? <ThemedText type="sub">{dish.note}</ThemedText> : null}

      {(onSwap || dish?.recipe_url) && (
        <View style={styles.actions}>
          {onSwap && eaters.length > 0 && (
            <Button title="Byt ret" variant="secondary" onPress={onSwap} loading={swapping} style={styles.action} />
          )}
          {dish?.recipe_url && (
            <Button
              title="Opskrift"
              variant="secondary"
              accessibilityHint="Åbner opskriften i browseren"
              onPress={() => WebBrowser.openBrowserAsync(dish.recipe_url!)}
              style={styles.action}
            />
          )}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  action: {
    flexGrow: 1,
  },
});
