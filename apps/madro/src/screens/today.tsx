import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { errorText } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useHousehold } from '@/providers/household';

// I dag. I fase 0 er det husstanden, invitationer og log ud. Dagens måltider kommer i fase 1.
export function Today() {
  const { household } = useHousehold();
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

      <ThemedView type="card" style={styles.card}>
        <ThemedText type="cap" themeColor="textSecondary">
          Husstand
        </ThemedText>
        <ThemedText type="title">{household?.name}</ThemedText>
        <ThemedText themeColor="textSecondary">
          Dagens måltider, indkøb og budget dukker op her, når madplanen er bygget.
        </ThemedText>
      </ThemedView>

      <View style={styles.actions}>
        {canInvite && <Button title="Invitér en voksen" onPress={invite} loading={busy} />}
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
