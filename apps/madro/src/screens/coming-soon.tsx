import { StyleSheet } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';

type ComingSoonProps = {
  title: string;
  text: string;
  /** Universets bløde farve som baggrund på kortet. */
  tone: ThemeColor;
};

export function ComingSoon({ title, text, tone }: ComingSoonProps) {
  return (
    <Screen tabs>
      <ThemedText type="large">{title}</ThemedText>
      <ThemedView type={tone} style={styles.card}>
        <ThemedText>{text}</ThemedText>
      </ThemedView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
  },
});
