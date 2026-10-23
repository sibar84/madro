// Fejlkoderne fra databasefunktionerne oversat til tekst, man kan handle på.
const messages: Record<string, string> = {
  invitation_invalid: 'Invitationen virker ikke. Den kan være brugt, trukket tilbage eller udløbet.',
  not_allowed: 'Det har du ikke adgang til.',
  last_owner: 'Du er den eneste ejer. Giv ejerskabet videre, før du forlader husstanden.',
  not_authenticated: 'Du er ikke logget ind længere. Log ind igen.',
};

// Supabase Auths fejlkoder (error.code), så vi ikke gætter ud fra beskedens ordlyd.
const authCodes: Record<string, string> = {
  otp_expired: 'Koden er forkert eller udløbet. Prøv igen, eller få en ny kode.',
  over_email_send_rate_limit: 'Vent et øjeblik, før du beder om en ny kode.',
  over_request_rate_limit: 'Vent et øjeblik, før du prøver igen.',
  email_address_invalid: 'E-mailadressen ser ikke rigtig ud.',
  email_address_not_authorized: 'Vi kan ikke sende mail til den adresse endnu.',
  signup_disabled: 'Der kan ikke oprettes nye brugere lige nu.',
};

export function errorText(error: unknown) {
  const err = error as { message?: string; code?: string } | null;
  const message = error instanceof Error ? error.message : String(err?.message ?? error);
  if (messages[message]) return messages[message];
  // Ukendte fejl skrives i konsollen, så de kan findes uden at gætte.
  console.error('Madro-fejl', err?.code ?? '', message);
  if (err?.code && authCodes[err.code]) return authCodes[err.code];
  if (/token has expired|token is invalid|otp/i.test(message)) return 'Koden er forkert eller udløbet. Prøv igen, eller få en ny kode.';
  if (/rate limit|security purposes/i.test(message)) return 'Vent et øjeblik, før du beder om en ny kode.';
  if (/network|fetch/i.test(message)) return 'Der er ingen forbindelse. Tjek internettet og prøv igen.';
  return `Noget gik galt: ${message}`;
}
