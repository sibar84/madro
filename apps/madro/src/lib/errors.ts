// Fejlkoderne fra databasefunktionerne oversat til tekst, man kan handle på.
const messages: Record<string, string> = {
  invitation_invalid: 'Invitationen virker ikke. Den kan være brugt, trukket tilbage eller udløbet.',
  not_allowed: 'Det har du ikke adgang til.',
  last_owner: 'Du er den eneste ejer. Giv ejerskabet videre, før du forlader husstanden.',
  not_authenticated: 'Du er ikke logget ind længere. Log ind igen.',
};

export function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  if (messages[message]) return messages[message];
  if (/token has expired|invalid/i.test(message)) return 'Koden er forkert eller udløbet. Prøv igen, eller få en ny kode.';
  if (/rate limit|security purposes/i.test(message)) return 'Vent et øjeblik, før du beder om en ny kode.';
  if (/network|fetch/i.test(message)) return 'Der er ingen forbindelse. Tjek internettet og prøv igen.';
  return 'Noget gik galt. Prøv igen.';
}
