import { Stack } from 'expo-router';

import { HouseholdProvider, useHousehold } from '@/providers/household';

export default function AppLayout() {
  return (
    <HouseholdProvider>
      <HouseholdNavigator />
    </HouseholdProvider>
  );
}

function HouseholdNavigator() {
  const { household, loading } = useHousehold();
  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!household}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!household}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
