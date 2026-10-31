import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { ErrorScreen } from '@/components/error-screen';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { startMonitoring, wrapRoot } from '@/lib/monitoring';
import { SessionProvider, useSession } from '@/providers/session';

startMonitoring();
SplashScreen.preventAutoHideAsync();

// En fejl et sted i appen viser en forklaring i stedet for en blank side.
export { ErrorScreen as ErrorBoundary };

function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const colors = Colors[scheme];

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.beet,
          background: colors.background,
          card: colors.background,
          text: colors.text,
          border: colors.line,
        },
      }}>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </ThemeProvider>
  );
}

export default wrapRoot(RootLayout);

function RootNavigator() {
  const { session, loading } = useSession();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)/login" />
      </Stack.Protected>
      <Stack.Screen name="invitation" />
    </Stack>
  );
}
