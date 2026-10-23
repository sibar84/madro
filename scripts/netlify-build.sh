#!/bin/sh
# Netlify-bygning: offentlige sider plus webversionen af appen under /app/.
set -eu

rm -rf _site
mkdir -p _site
cp -r index.html prototype pitch brand _site/

# Supabase-adressen og den offentlige anon/publishable-nøgle sættes som
# miljøvariabler i Netlify. Hemmelige nøgler hører aldrig hjemme her.
if [ -z "${EXPO_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
  echo "EXPO_PUBLIC_SUPABASE_URL og EXPO_PUBLIC_SUPABASE_ANON_KEY mangler i Netlify. Appen bygges ikke."
  exit 1
fi

cd apps/madro
npm ci
npx expo export --platform web --output-dir ../../_site/app
