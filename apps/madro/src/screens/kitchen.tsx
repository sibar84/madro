import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useMealPlan } from '@/hooks/use-meal-plan';
import { saveHouseholdSettings } from '@/lib/economy';
import { errorText } from '@/lib/errors';
import { today } from '@/lib/meal-plan';
import { remindersEnabled, remindersSupported, scheduleReminders, setRemindersEnabled } from '@/lib/reminders';
import { clock, COOK_MINUTES, DINNER_TIMES, reminders, shortTime, startTime, type CookingDay } from '@/kitchen/timing';
import { mondayOf } from '@/planner/engine';
import { names } from '@/planner/texts';
import { useHousehold } from '@/providers/household';

/** Dagens ret med tidsplan, og påmindelse om at gå i gang. */
export function Kitchen() {
  const router = useRouter();
  const { household, refresh } = useHousehold();
  const date = today();
  const { plan, dishes, persons, loading } = useMealPlan(mondayOf(date));
  const [remind, setRemind] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = household?.role === 'owner' || household?.role === 'adult';
  const dinner = shortTime(household?.dinner_time ?? '17:30');

  const tonight = plan?.days.find((d) => d.date === date);
  const dish = tonight?.dishId ? dishes.get(tonight.dishId) : undefined;
  const eaters = persons.filter((p) => tonight?.eaters.includes(p.id));

  // Ugens dage med en ret, til påmindelserne.
  const cookingDays: CookingDay[] = (plan?.days ?? []).flatMap((d) => {
    const dd = d.dishId ? dishes.get(d.dishId) : undefined;
    return dd ? [{ date: d.date, dish: dd.name, effort: dd.effort }] : [];
  });
  const scheduleKey = `${dinner}|${cookingDays.map((d) => `${d.date}:${d.dish}`).join(',')}`;

  useEffect(() => {
    remindersEnabled().then(setRemind);
  }, []);

  // Påmindelserne lægges igen, når planen eller spisetiden ændres.
  useEffect(() => {
    if (remind) scheduleReminders(reminders(cookingDays, dinner, new Date())).catch(() => {});
    // cookingDays er indeholdt i scheduleKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remind, scheduleKey]);

  async function onDinner(time: string) {
    if (!household || time === dinner) return;
    setSaving(true);
    setError(null);
    try {
      await saveHouseholdSettings(household.id, {
        dinner_time: time,
        food_budget: household.food_budget,
        payday: household.payday,
      });
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function onRemind() {
    setError(null);
    const ok = await setRemindersEnabled(!remind);
    if (!ok) {
      setError('Madro har ikke lov til at give besked. Slå det til under Indstillinger på telefonen.');
      return;
    }
    setRemind(!remind);
  }

  return (
    <Screen tabs>
      <ThemedText type="large">Køkken</ThemedText>

      {loading ? (
        <ActivityIndicator accessibilityLabel="Henter dagens ret" />
      ) : dish && tonight ? (
        <ThemedView type="card" style={styles.card}>
          <ThemedText type="cap" themeColor="textSecondary">
            Dagens ret
          </ThemedText>
          <ThemedText type="title">{dish.name}</ThemedText>
          {eaters.length > 0 && (
            <ThemedText type="sub" themeColor="textSecondary">
              Til {names(eaters)}
            </ThemedText>
          )}

          <View style={styles.timeline} accessibilityRole="list">
            <TimeRow time={startTime(dinner, dish.effort)} label="Gå i gang" />
            <TimeRow time={dinner} label="Maden er klar" />
          </View>
          <ThemedText type="foot" themeColor="textSecondary">
            Madro regner med {COOK_MINUTES[dish.effort]} minutter til en {dish.effort === 'hurtig' ? 'hurtig' : dish.effort === 'lang' ? 'lang' : 'almindelig'} ret.
          </ThemedText>
          {dish.note ? <ThemedText type="sub">{dish.note}</ThemedText> : null}

          {dish.recipe_url && (
            <Button
              title="Se opskriften"
              accessibilityHint="Åbner opskriften i browseren"
              onPress={() => WebBrowser.openBrowserAsync(dish.recipe_url!)}
            />
          )}
        </ThemedView>
      ) : (
        <ThemedView type="card" style={styles.card}>
          <ThemedText type="title">{tonight ? 'Ingen aftensmad i dag' : 'Ugens plan mangler'}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {tonight
              ? 'Ingen spiser hjemme i aften ifølge planen.'
              : 'Lav ugens plan, så står dagens ret og tidsplanen her.'}
          </ThemedText>
          {!tonight && <Button title="Lav ugens plan" onPress={() => router.navigate('/plan')} />}
        </ThemedView>
      )}

      <View style={styles.section}>
        <ThemedText type="head">Spisetid</ThemedText>
        <ChipRow>
          {DINNER_TIMES.map((time) => (
            <Chip
              key={time}
              label={clock(time)}
              accessibilityLabel={`Spisetid ${clock(time)}`}
              selected={dinner === time}
              disabled={!canEdit || saving}
              onPress={() => onDinner(time)}
            />
          ))}
        </ChipRow>
      </View>

      <View style={styles.section}>
        <ThemedText type="head">Påmindelse</ThemedText>
        {remindersSupported ? (
          <>
            <ThemedText themeColor="textSecondary">
              Telefonen giver besked, når det er tid at gå i gang med aftensmaden.
            </ThemedText>
            <Button
              title={remind ? 'Slå påmindelser fra' : 'Påmind mig'}
              variant="secondary"
              accessibilityState={{ checked: remind }}
              onPress={onRemind}
            />
          </>
        ) : (
          <ThemedText themeColor="textSecondary">Påmindelser virker i appen på telefonen.</ThemedText>
        )}
      </View>

      {error && (
        <ThemedText themeColor="bad" accessibilityRole="alert">
          {error}
        </ThemedText>
      )}
    </Screen>
  );
}

function TimeRow({ time, label }: { time: string; label: string }) {
  return (
    <View style={styles.timeRow} accessibilityRole="text" accessibilityLabel={`${label} kl. ${clock(time)}`}>
      <ThemedText type="head" style={styles.time}>
        {clock(time)}
      </ThemedText>
      <ThemedText>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  timeline: {
    gap: Spacing.two,
    marginVertical: Spacing.two,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.three,
  },
  time: {
    minWidth: 56,
    fontVariant: ['tabular-nums'],
  },
  section: {
    gap: Spacing.two,
  },
});
