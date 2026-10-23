import type { ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/** Vises i stedet for en blank skærm, når appen går ned. Fejlen står på skærmen, så den kan sendes videre. */
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('Madro gik ned', error);
    SplashScreen.hideAsync();
  }, [error]);

  // På web starter en genindlæsning forfra med den nyeste version af appen.
  const reload = () => (Platform.OS === 'web' ? window.location.reload() : retry());

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="large">Noget gik galt</ThemedText>
        <ThemedText themeColor="textSecondary">
          Madro stødte på en fejl. Prøv igen. Sker det igen, så send et billede af skærmen.
        </ThemedText>
        <ThemedText type="sub" themeColor="bad" selectable>
          {error.message}
        </ThemedText>
        <Button title="Prøv igen" onPress={reload} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
  },
});
