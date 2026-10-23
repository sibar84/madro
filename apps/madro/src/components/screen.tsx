import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

/** Fælles ramme for en skærm: sikker afstand til kanter og en læsevenlig bredde på web. */
export function Screen({ children, tabs = false }: { children: ReactNode; tabs?: boolean }) {
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={tabs ? ['top'] : ['top', 'bottom']}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, tabs && { paddingBottom: BottomTabInset + Spacing.four }]}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
  },
});
