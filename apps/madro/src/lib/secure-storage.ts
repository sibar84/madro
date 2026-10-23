import * as SecureStore from 'expo-secure-store';

// SecureStore tillader højst ca. 2 KB pr. nøgle, og en Supabase-session er større.
// Værdien deles derfor op i bidder, der gemmes under hver sin nøgle.
const CHUNK = 1800;

const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

async function removeChunks(key: string) {
  const n = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
  await Promise.all(
    Array.from({ length: n }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i))),
  );
  await SecureStore.deleteItemAsync(countKey(key));
}

export const secureStorage = {
  async getItem(key: string) {
    const raw = await SecureStore.getItemAsync(countKey(key));
    if (raw === null) return null;
    const parts = await Promise.all(
      Array.from({ length: Number(raw) }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
    );
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string) {
    await removeChunks(key);
    const n = Math.ceil(value.length / CHUNK);
    await Promise.all(
      Array.from({ length: n }, (_, i) =>
        SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK)),
      ),
    );
    await SecureStore.setItemAsync(countKey(key), String(n));
  },
  async removeItem(key: string) {
    await removeChunks(key);
  },
};
