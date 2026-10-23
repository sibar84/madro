import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { secureStorage } from '@/lib/secure-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL og EXPO_PUBLIC_SUPABASE_ANON_KEY mangler. Se apps/madro/.env.example.',
  );
}

// Kun adressens rod bruges, så en indsat Data API-adresse (…/rest/v1/) også virker.
const projectUrl = new URL(url).origin;

// Typer genereres fra databasen med `npm run db:types`, når projektet er forbundet.
export const supabase = createClient(projectUrl, anonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// På telefonen fornyes adgangsnøglen kun, mens appen er i forgrunden.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
