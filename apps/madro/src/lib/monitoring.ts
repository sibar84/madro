import * as Sentry from '@sentry/react-native';

// Adressen (DSN) er ikke en hemmelighed; den ligger i appen, hvor den bruges.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** Slår fejlrapportering til. Uden adresse sker der ingenting. */
export function startMonitoring() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    // Ingen personoplysninger, målinger eller skærmoptagelser. Kun selve fejlene.
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableAutoSessionTracking: false,
  });
}

/** Sender en fejl til Sentry, hvis det er slået til. */
export function reportError(error: unknown) {
  if (dsn) Sentry.captureException(error);
}

export const wrapRoot = dsn ? Sentry.wrap : <T,>(component: T) => component;
