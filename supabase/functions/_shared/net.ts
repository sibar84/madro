// Fælles regler for funktioner, der henter sider på adresser brugeren har givet.
// Kun almindelige https-adresser til offentlige servere må hentes.

const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/** Kun almindelige https-adresser til offentlige sider. */
export function safeUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return null;
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return null;
  return url;
}

/** Er adressen privat eller intern? Bruges på det, navnet slår op til. */
export function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
  }
  return PRIVATE_V4.some((p) => p.test(ip));
}

/** Må navnet slå op til en offentlig adresse? Hvis opslag ikke kan bruges her, afgør navnet alene. */
export async function isPublicHost(host: string): Promise<boolean> {
  try {
    const [v4, v6] = await Promise.all([
      Deno.resolveDns(host, 'A').catch(() => [] as string[]),
      Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
    ]);
    const all = [...v4, ...v6];
    return all.length === 0 || !all.some(isPrivateAddress);
  } catch {
    return true;
  }
}

/**
 * Henter en tekstside, følger få omdirigeringer og tjekker hver adresse.
 * Giver null, hvis siden ikke kan hentes, ikke er tekst, eller adressen er privat.
 */
export async function fetchText(
  start: URL,
  options: { accept: string; agent: string; types: string[]; maxBytes: number },
): Promise<string | null> {
  let url = start;
  for (let hop = 0; hop <= 3; hop++) {
    if (!(await isPublicHost(url.hostname))) return null;
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { Accept: options.accept, 'User-Agent': options.agent },
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      const target = next ? safeUrl(new URL(next, url).toString()) : null;
      if (!target) return null;
      url = target;
      continue;
    }
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !options.types.some((t) => type.includes(t))) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let text = '';
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > options.maxBytes) {
        await reader.cancel();
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text;
  }
  return null;
}
