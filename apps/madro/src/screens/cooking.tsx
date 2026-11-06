import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useMealPlan } from '@/hooks/use-meal-plan';
import { errorText } from '@/lib/errors';
import { today } from '@/lib/meal-plan';
import { fetchRecipe, type SavedRecipe } from '@/lib/recipes';
import { formatTimer, remainingSeconds, spoken } from '@/kitchen/cooking';
import { mondayOf } from '@/planner/engine';
import { useHousehold } from '@/providers/household';

const timerNote = (step: number, left: number) => `trin ${step + 1} ${left > 0 ? formatTimer(left) : 'er færdigt'}`;

/** Madlavningstilstand: ét trin ad gangen med store bogstaver og en nedtælling, når et trin har en tid. */
export function Cooking() {
  const { household } = useHousehold();
  const date = today();
  const { plan, loading: planLoading } = useMealPlan(mondayOf(date));
  const dishId = plan?.days.find((d) => d.date === date)?.dishId ?? null;
  const [recipe, setRecipe] = useState<SavedRecipe | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [showList, setShowList] = useState(false);
  // Slut for hvert trins nedtælling, i ms. Et trin uden nøgle har ingen kørende timer.
  const [timers, setTimers] = useState<Record<number, number>>({});
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (planLoading || !household || !dishId) return;
    fetchRecipe(household.id, dishId)
      .then(setRecipe)
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoaded(true));
  }, [household, dishId, planLoading]);

  // Uret går kun, mens en timer kører.
  const running = Object.keys(timers).length > 0;
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [running]);

  const waiting = planLoading || (!!household && !!dishId && !loaded);
  if (waiting) return <ActivityIndicator style={styles.spinner} accessibilityLabel="Henter opskriften" />;

  if (!recipe) {
    return (
      <Screen>
        <ThemedText type="large">Ingen opskrift</ThemedText>
        <ThemedText themeColor="textSecondary">
          {error ?? 'Dagens ret har ingen gemt opskrift. Hent den under Køkken.'}
        </ThemedText>
      </Screen>
    );
  }

  const step = recipe.steps[index];
  const last = index === recipe.steps.length - 1;
  const endAt = timers[index];
  const left = endAt === undefined ? null : remainingSeconds(endAt, now);

  return (
    <Screen>
      <ThemedText type="cap" themeColor="textSecondary">
        {recipe.title} · trin {index + 1} af {recipe.steps.length}
      </ThemedText>

      <ThemedView type="card" style={styles.step}>
        <ThemedText type="large" accessibilityLiveRegion="polite">
          {step.text}
        </ThemedText>

        {step.timer_seconds !== null && (
          <View style={styles.timer}>
            {left === null ? (
              <Button
                title={`Start timer på ${spoken(step.timer_seconds)}`}
                variant="secondary"
                onPress={() => {
                  setNow(Date.now());
                  setTimers({ ...timers, [index]: Date.now() + step.timer_seconds! * 1000 });
                }}
              />
            ) : left > 0 ? (
              <ThemedText type="title" accessibilityRole="timer">
                {formatTimer(left)}
              </ThemedText>
            ) : (
              <ThemedText type="title" themeColor="bad" accessibilityRole="alert">
                Tiden er gået
              </ThemedText>
            )}
          </View>
        )}
      </ThemedView>

      <View style={styles.nav}>
        <View style={styles.navButton}>
          <Button title="Forrige" variant="secondary" disabled={index === 0} onPress={() => setIndex(index - 1)} />
        </View>
        <View style={styles.navButton}>
          <Button title={last ? 'Færdig' : 'Næste'} disabled={last} onPress={() => setIndex(index + 1)} />
        </View>
      </View>

      {Object.keys(timers).length > 0 && (
        <ThemedText type="foot" themeColor="textSecondary" accessibilityLiveRegion="polite">
          Timere: {Object.keys(timers).map((i) => timerNote(Number(i), remainingSeconds(timers[Number(i)], now))).join(', ')}
        </ThemedText>
      )}

      <Button title={showList ? 'Skjul ingredienser' : 'Vis ingredienser'} variant="secondary" onPress={() => setShowList(!showList)} />
      {showList && (
        <ThemedView type="card" style={styles.list}>
          {recipe.ingredients.map((item, i) => (
            <ThemedText key={i}>{item}</ThemedText>
          ))}
        </ThemedView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  spinner: {
    flex: 1,
  },
  step: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  timer: {
    gap: Spacing.two,
  },
  nav: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  navButton: {
    flex: 1,
  },
  list: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
