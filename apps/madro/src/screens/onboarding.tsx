import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { errorText } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useHousehold } from '@/providers/household';

// Første gang efter login: opret en husstand, eller gå med i en med en invitation.
export function Onboarding({ initialToken }: { initialToken?: string }) {
  const { refresh } = useHousehold();
  const [mode, setMode] = useState<'create' | 'join'>(initialToken ? 'join' : 'create');
  const [name, setName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [token, setToken] = useState(initialToken ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error } =
      mode === 'create'
        ? await supabase.rpc('create_household', { p_name: householdName.trim(), p_display_name: name.trim() })
        : await supabase.rpc('accept_invitation', { p_token: token.trim(), p_display_name: name.trim() });
    if (error) {
      setBusy(false);
      setError(errorText(error));
      return;
    }
    await refresh();
  }

  const ready = name.trim() && (mode === 'create' ? householdName.trim() : token.trim().length === 64);

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="large">Velkommen</ThemedText>
        <ThemedText themeColor="textSecondary">
          {mode === 'create'
            ? 'Opret jeres husstand. Bagefter kan du invitere den anden voksne og tilføje børnene.'
            : 'Indsæt invitationen, du har fået fra din husstand.'}
        </ThemedText>
      </View>

      <View style={styles.form}>
        <TextField label="Dit navn" value={name} onChangeText={setName} autoComplete="given-name" />
        {mode === 'create' ? (
          <TextField
            label="Husstandens navn"
            placeholder="Fx Familien Jensen"
            value={householdName}
            onChangeText={setHouseholdName}
          />
        ) : (
          <TextField
            label="Invitation"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        <Button
          title={mode === 'create' ? 'Opret husstand' : 'Gå med i husstanden'}
          onPress={submit}
          loading={busy}
          disabled={!ready}
        />
        <Button
          variant="secondary"
          title={mode === 'create' ? 'Jeg har en invitation' : 'Opret en ny husstand i stedet'}
          onPress={() => {
            setMode(mode === 'create' ? 'join' : 'create');
            setError(null);
          }}
        />
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
  header: {
    gap: Spacing.two,
    marginTop: Spacing.five,
  },
  form: {
    gap: Spacing.three,
  },
});
