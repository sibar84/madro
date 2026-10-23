import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { MealDay } from '@/components/meal-day';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useMealPlan } from '@/hooks/use-meal-plan';
import { today } from '@/lib/meal-plan';
import { addDays, mondayOf } from '@/planner/engine';
import { names, WEEKDAYS, WEEKDAYS_SHORT } from '@/planner/texts';
import { useHousehold } from '@/providers/household';

function dateLabel(date: string, weekday: number): string {
  const [, month, day] = date.split('-').map(Number);
  return `${WEEKDAYS[weekday - 1]} ${day}/${month}`;
}

/** Ugens aftensmad. Først hvem der spiser med og hvilke dage der er travle, så planen. */
export function Plan() {
  const router = useRouter();
  const { household } = useHousehold();
  const thisWeek = mondayOf(today());
  const [weekStart, setWeekStart] = useState(thisWeek);
  const { persons, dishes, plan, loading, saving, error, makePlan, swap } = useMealPlan(weekStart);
  // Ændrede travle dage gælder kun den uge, de er valgt i. Ellers vises den gemte plans dage.
  const [draft, setDraft] = useState<{ week: string; days: number[] } | null>(null);
  const busyDays = draft?.week === weekStart ? draft.days : (plan?.busyDays ?? []);
  const setBusyDays = (days: number[]) => setDraft({ week: weekStart, days });
  const [swapping, setSwapping] = useState<string | null>(null);
  const canEdit = household?.role === 'owner' || household?.role === 'adult';

  const busyChanged = !!plan && [...busyDays].sort((a, b) => a - b).join() !== [...plan.busyDays].sort((a, b) => a - b).join();

  async function onSwap(date: string) {
    setSwapping(date);
    await swap(date);
    setSwapping(null);
  }

  return (
    <Screen tabs>
      <ThemedText type="large">Plan</ThemedText>

      <ChipRow>
        <Chip label="Denne uge" selected={weekStart === thisWeek} onPress={() => setWeekStart(thisWeek)} />
        <Chip
          label="Næste uge"
          selected={weekStart !== thisWeek}
          onPress={() => setWeekStart(addDays(thisWeek, 7))}
        />
      </ChipRow>

      {loading ? (
        <ActivityIndicator accessibilityLabel="Henter planen" />
      ) : (
        <>
          {canEdit && (
            <ThemedView type="leafSoft" style={styles.card}>
              <View style={styles.row}>
                <View style={styles.grow}>
                  <ThemedText type="sub" themeColor="textSecondary">
                    Hvem spiser med
                  </ThemedText>
                  <ThemedText>{names(persons)}</ThemedText>
                </View>
                <Button title="Hvem er I?" variant="secondary" onPress={() => router.push('/familie')} />
              </View>

              <ThemedText type="sub" themeColor="textSecondary">
                Hvilke dage har I travlt?
              </ThemedText>
              <ChipRow>
                {WEEKDAYS_SHORT.map((label, i) => (
                  <Chip
                    key={label}
                    label={label}
                    accessibilityLabel={WEEKDAYS[i]}
                    selected={busyDays.includes(i + 1)}
                    onPress={() =>
                      setBusyDays(busyDays.includes(i + 1) ? busyDays.filter((d) => d !== i + 1) : [...busyDays, i + 1])
                    }
                  />
                ))}
              </ChipRow>

              {!plan ? (
                <Button title="Lav ugens plan" onPress={() => makePlan(busyDays)} loading={saving} />
              ) : (
                <Button
                  title={busyChanged ? 'Lav planen igen med de nye dage' : 'Lav en ny plan'}
                  variant="secondary"
                  onPress={() => makePlan(busyDays)}
                  loading={saving && !swapping}
                />
              )}
            </ThemedView>
          )}

          {!plan && !canEdit && (
            <ThemedText themeColor="textSecondary">Ugens plan er ikke lavet endnu.</ThemedText>
          )}

          {plan?.days.map((day) => (
            <MealDay
              key={day.date}
              label={dateLabel(day.date, day.weekday)}
              day={day}
              dish={day.dishId ? dishes.get(day.dishId) : undefined}
              persons={persons}
              onSwap={canEdit ? () => onSwap(day.date) : undefined}
              swapping={swapping === day.date}
            />
          ))}
        </>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  grow: {
    flex: 1,
  },
});
