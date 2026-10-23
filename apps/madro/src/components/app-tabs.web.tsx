import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps, type TabListProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';

const tabs = [
  { name: 'index', label: 'I dag', href: '/' },
  { name: 'plan', label: 'Plan', href: '/plan' },
  { name: 'indkob', label: 'Indkøb', href: '/indkob' },
  { name: 'kokken', label: 'Køkken', href: '/kokken' },
  { name: 'okonomi', label: 'Økonomi', href: '/okonomi' },
] as const;

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          {tabs.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton>{tab.label}</TabButton>
            </TabTrigger>
          ))}
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ref: _ref, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type={isFocused ? 'beetSoft' : 'card'} style={styles.tabButton}>
        <ThemedText type="sub" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function CustomTabList(props: TabListProps) {
  return (
    <View {...props} style={styles.container}>
      <ThemedView type="card" style={styles.inner}>
        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: Spacing.three,
    alignItems: 'center',
  },
  inner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: Radius.pill,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  tabButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  pressed: {
    opacity: 0.7,
  },
});
