# Madro-appen

Expo-app til iPhone, Android og web. Én kodebase, Expo Router og Supabase.

## Kom i gang

```bash
npm install
cp .env.example .env.local   # udfyld med værdier fra Supabase-projektet
npx expo start
```

Tryk `w` for web, eller scan QR-koden med en udviklingsbuild på telefonen.

## Struktur

| Mappe | Indhold |
| --- | --- |
| `src/app` | Kun ruter. `(auth)` er login, `(app)` kræver login, `(app)/(tabs)` er de fem faner. |
| `src/screens` | Skærmenes indhold, som ruterne viser. |
| `src/components` | Genbrugelige dele: knap, tekstfelt, skærmramme, faner. |
| `src/providers` | Session og husstand. |
| `src/lib` | Supabase-klient, sikker lagring og fejltekster. |
| `src/constants/theme.ts` | Madros farver, typografi, afstande og bevægelse. |

## Tjek før commit

```bash
npm run lint
npm run typecheck
```

Databasen ligger i `../../supabase`. Se rodens README for migrationer og tests.
