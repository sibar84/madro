import { NativeTabs } from 'expo-router/native-tabs';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// De fem universer fra prototypen. Ikonerne er SF Symbols på iPhone.
export const tabs = [
  { name: 'index', label: 'I dag', sf: 'sun.max' },
  { name: 'plan', label: 'Plan', sf: 'calendar' },
  { name: 'indkob', label: 'Indkøb', sf: 'cart' },
  { name: 'kokken', label: 'Køkken', sf: 'fork.knife' },
  { name: 'okonomi', label: 'Økonomi', sf: 'chart.pie' },
] as const;

export default function AppTabs() {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.beetSoft}
      labelStyle={{ selected: { color: colors.text } }}>
      {tabs.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={tab.sf} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
