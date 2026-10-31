import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { errorText } from '@/lib/errors';
import { FEEDBACK_MAX, sendFeedback } from '@/lib/feedback';
import { useHousehold } from '@/providers/household';

/** Testerne skriver, hvad der driller, eller hvad de savner. */
export function Feedback() {
  const router = useRouter();
  const { household } = useHousehold();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSend() {
    setBusy(true);
    setError(null);
    try {
      await sendFeedback(household?.id ?? null, message);
      setSent(true);
      setMessage('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen>
        <ThemedText type="large">Tak</ThemedText>
        <ThemedText themeColor="textSecondary">Din besked er sendt. Den hjælper os med at gøre Madro bedre.</ThemedText>
        <Button title="Send en til" variant="secondary" onPress={() => setSent(false)} />
        <Button title="Tilbage" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        Skriv, hvad der ikke virker, eller hvad du savner. Skriv gerne, hvilken skærm du var på.
      </ThemedText>
      <TextField
        label="Din besked"
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={FEEDBACK_MAX}
        style={styles.input}
      />
      <Button title="Send" onPress={onSend} loading={busy} disabled={message.trim().length === 0} />
      {error && (
        <ThemedText themeColor="bad" accessibilityRole="alert">
          {error}
        </ThemedText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 160,
    textAlignVertical: 'top',
    paddingTop: Spacing.three,
  },
});
