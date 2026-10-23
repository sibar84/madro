import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { MealDay } from '@/components/meal-day';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useMealPlan } from '@/hooks/use-meal-plan';
import { errorText } from '@/lib/errors';
import { today } from '@/lib/meal-plan';
import { supabase } from '@/lib/supabase';
import { mondayOf } from '@/planner/engine';
import { useHousehold } from '@/providers/household';

// I dag: aftenens ret fra ugens plan, og husstanden med invitationer og log ud.
export function Today() {
  const router = useRouter();
  const { household } = useHousehold();
  const date = today();
  const meal = useMealPlan(mondayOf(date));
  const tonight = meal.plan?.days.find((d) => d.date === date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canInvite = household?.role === 'owner' || household?.role === 'adult';

  async function invite() {
    if (!household) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('create_invitation', { p_household: household.id });
    setBusy(false);
    if (error) {
      setError(errorText(error));
      return;
    }
    const link = `madro://invitation?token=${data}`;
    await Share.share({
      message: `Kom med i ${household.name} på Madro. Åbn linket på din telefon, eller indsæt invitationen i appen: ${data}\n\n${link}`,
    });
  }

  return (
    <Screen tabs>
      <ThemedText type="large">I dag</ThemedText>

      {meal.loading ? (
        <ActivityIndicator accessibilityLabel="Henter aftenens ret" />
      ) : tonight ? (
        <MealDay
          label="I aften"
          day={tonight}
          dish={tonight.dishId ? meal.dishes.get(tonight.dishId) : undefined}
          persons={meal.persons}
        />
      ) : (
        <ThemedView type="leafSoft" style={styles.card}>
          <ThemedText type="title">Ugens plan mangler</ThemedText>
          <ThemedText themeColor="textSecondary">
            Fortæl hvem der spiser med, og hvilke dage I har travlt, så laver Madro en uge med aftensmad.
          </ThemedText>
          {canInvite && <Button title="Lav ugens plan" onPress={() => router.navigate('/plan')} />}
        </ThemedView>
      )}

      {meal.error && (
        <ThemedText themeColor="bad" accessibilityRole="alert">
          {meal.error}
        </ThemedText>
      )}

      <ThemedView type="card" style={styles.card}>
        <ThemedText type="cap" themeColor="textSecondary">
          Husstand
        </ThemedText>
        <ThemedText type="title">{household?.name}</ThemedText>
      </ThemedView>

      <View style={styles.actions}>
        {canInvite && <Button title="Invitér en voksen" variant="secondary" onPress={invite} loading={busy} />}
        <Button title="Log ud" variant="secondary" onPress={() => supabase.auth.signOut()} />
      </View>

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
    gap: Spacing.two,
  },
  actions: {
    gap: Spacing.three,
  },
});
