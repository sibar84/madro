import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { errorText } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

// Login uden adgangskode: man får en 6-cifret kode på mail og skriver den her.
export function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (error) setError(errorText(error));
    else setStep('code');
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    // Ved succes skifter navigationen selv, når sessionen kommer.
    if (error) setError(errorText(error));
  }

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="large">Madro</ThemedText>
        <ThemedText themeColor="textSecondary">Familiens madplan, indkøb og budget ét sted.</ThemedText>
      </View>

      {step === 'email' ? (
        <View style={styles.form}>
          <TextField
            label="Din e-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            onSubmitEditing={sendCode}
          />
          <Button title="Send kode" onPress={sendCode} loading={busy} disabled={!email.includes('@')} />
        </View>
      ) : (
        <View style={styles.form}>
          <ThemedText>Vi har sendt en kode til {email.trim()}.</ThemedText>
          <TextField
            label="Kode fra mailen"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            onSubmitEditing={verify}
          />
          <Button title="Log ind" onPress={verify} loading={busy} disabled={code.length !== 6} />
          <Button
            title="Brug en anden e-mail"
            variant="secondary"
            onPress={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
          />
        </View>
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
  header: {
    gap: Spacing.two,
    marginTop: Spacing.five,
  },
  form: {
    gap: Spacing.three,
  },
});
