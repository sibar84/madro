import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { calendarError, hasCalendar, readBusyDays, removeCalendar, saveCalendar } from '@/lib/calendar';
import { useHousehold } from '@/providers/household';

/** Henter ugens travle dage fra familiens kalender, så de ikke skal vælges ved hånden. */
export function CalendarSync({ weekStart, onBusyDays }: { weekStart: string; onBusyDays: (days: number[]) => void }) {
  const { household } = useHousehold();
  const [linked, setLinked] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!household) return;
    hasCalendar(household.id)
      .then(setLinked)
      .catch(() => setLinked(false));
  }, [household]);

  useEffect(load, [load]);

  async function run(job: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await job();
    } catch (e) {
      setError(await calendarError(e));
    } finally {
      setBusy(false);
    }
  }

  const onFetch = () =>
    run(async () => {
      const days = await readBusyDays(household!.id, weekStart);
      onBusyDays(days);
      setMessage(days.length ? 'Travle dage er sat ud fra kalenderen. Ret dem, hvis det ikke passer.' : 'Kalenderen har intet om aftenen i den uge.');
    });

  const onSave = () =>
    run(async () => {
      await saveCalendar(household!.id, url);
      setUrl('');
      setAdding(false);
      setLinked(true);
      const days = await readBusyDays(household!.id, weekStart);
      onBusyDays(days);
      setMessage(days.length ? 'Kalenderen er gemt, og travle dage er sat.' : 'Kalenderen er gemt. Den har intet om aftenen i den uge.');
    });

  const onRemove = () =>
    run(async () => {
      await removeCalendar(household!.id);
      setLinked(false);
      setMessage('Kalenderen er fjernet.');
    });

  if (linked === null) return null;

  return (
    <View style={styles.box}>
      {linked && !adding ? (
        <>
          <Button title="Hent travle dage fra kalenderen" variant="secondary" onPress={onFetch} loading={busy} />
          <Button title="Fjern kalenderen" variant="secondary" onPress={onRemove} disabled={busy} />
        </>
      ) : adding ? (
        <>
          <ThemedText type="foot" themeColor="textSecondary">
            Brug kalenderens hemmelige iCal-adresse (Google Kalender: Indstillinger, Integrer kalender, Hemmelig adresse i iCal-format. iCloud: Del kalender, Offentlig kalender). Madro ser kun, hvilke aftener der er optaget, og gemmer ikke aftalerne. Den, der har adressen, kan læse kalenderen, så den kan kun ses af voksne i husstanden.
          </ThemedText>
          <TextField
            label="Kalenderlink"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://"
          />
          <Button title="Gem og hent" onPress={onSave} loading={busy} disabled={url.trim().length < 8} />
          <Button title="Annuller" variant="secondary" onPress={() => setAdding(false)} disabled={busy} />
        </>
      ) : (
        <Button title="Brug familiens kalender" variant="secondary" onPress={() => setAdding(true)} />
      )}
      {message && <ThemedText type="foot" themeColor="textSecondary">{message}</ThemedText>}
      {error && (
        <ThemedText themeColor="bad" accessibilityRole="alert">
          {error}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
});
