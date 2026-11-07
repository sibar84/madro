/** Kalenderlinket, som funktionen kan hente: webcal:// bliver til https://, og kun https accepteres. */
export function calendarUrl(input: string): string | null {
  const text = input.trim().replace(/^webcal:\/\//i, 'https://');
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
