import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ShoppingItem, ItemChanges } from '@/shopping/queue';

type ShoppingRowProps = {
  item: ShoppingItem;
  onChange: (changes: ItemChanges) => void;
  /** Forslag til en anden vare, når varen er udsolgt. */
  substitute: string | null;
  /** Varen er rettens hovedingrediens, så retten kan byttes i stedet. */
  onSwapDish?: () => void;
};

function noteOf(item: ShoppingItem): string {
  const parts = [];
  if (item.source === 'staple') parts.push('Fast vare');
  if (item.note) parts.push(item.source === 'staple' ? `også ${item.note}` : item.note);
  if (item.replaced_from) parts.push(`i stedet for ${item.replaced_from}`);
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Én vare på listen. Tryk for at krydse af. Flere valg ligger bag "Mere". */
export function ShoppingRow({ item, onChange, substitute, onSwapDish }: ShoppingRowProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const checked = !!item.checked_at;
  const note = noteOf(item);

  return (
    <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <View style={styles.main}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={item.name}
          accessibilityHint={note || undefined}
          onPress={() => onChange({ checked_at: checked ? null : new Date().toISOString() })}
          style={({ pressed }) => [styles.check, pressed && styles.pressed]}>
          <View
            style={[
              styles.box,
              { borderColor: checked ? theme.text : theme.textSecondary },
              checked && { backgroundColor: theme.text },
            ]}>
            {checked && (
              <ThemedText type="foot" themeColor="background" style={styles.tick}>
                ✓
              </ThemedText>
            )}
          </View>
          <View style={styles.text}>
            <ThemedText
              themeColor={checked ? 'textSecondary' : 'text'}
              style={checked && styles.struck}>
              {item.name}
            </ThemedText>
            {note ? (
              <ThemedText type="foot" themeColor="textSecondary">
                {note}
              </ThemedText>
            ) : null}
          </View>
        </Pressable>
        {item.sold_out && !checked && (
          <ThemedText type="foot" themeColor="bad" style={styles.badge}>
            Udsolgt
          </ThemedText>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Flere valg for ${item.name}`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
          hitSlop={8}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
          <ThemedText themeColor="textSecondary">⋯</ThemedText>
        </Pressable>
      </View>

      {item.sold_out && !checked && (
        <View style={styles.actions}>
          {substitute && (
            <Button
              title={`Køb ${substitute.toLowerCase()}`}
              variant="secondary"
              onPress={() =>
                onChange({ name: substitute, replaced_from: item.replaced_from ?? item.name, sold_out: false })
              }
              style={styles.action}
            />
          )}
          {onSwapDish && <Button title="Byt retten" variant="secondary" onPress={onSwapDish} style={styles.action} />}
          {!substitute && !onSwapDish && (
            <ThemedText type="foot" themeColor="textSecondary">
              Madro kender ikke en erstatning. Spring den over, eller køb noget andet.
            </ThemedText>
          )}
        </View>
      )}

      {open && (
        <View style={styles.actions}>
          <Button
            title={item.sold_out ? 'Ikke udsolgt alligevel' : 'Udsolgt'}
            variant="secondary"
            onPress={() => {
              onChange({ sold_out: !item.sold_out });
              setOpen(false);
            }}
            style={styles.action}
          />
          <Button
            title="Har vi, fjern"
            variant="secondary"
            onPress={() => onChange({ removed_at: new Date().toISOString() })}
            style={styles.action}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: Radius.card,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  check: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 44,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: Radius.small,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    fontWeight: '700',
  },
  text: {
    flex: 1,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  badge: {
    fontWeight: '600',
  },
  more: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  action: {
    flexGrow: 1,
  },
});
