import { calendarUrl } from '@/lib/calendar-url';
import { errorText } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

/** Er der gemt et kalenderlink for husstanden? Kun voksne kan se det. */
export async function hasCalendar(householdId: string): Promise<boolean> {
  const { data, error } = await supabase.from('calendar_links').select('household_id').eq('household_id', householdId).maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Gemmer linket. Kaster en tekst, hvis linket ikke ser rigtigt ud. */
export async function saveCalendar(householdId: string, input: string): Promise<void> {
  const url = calendarUrl(input);
  if (!url) throw new Error('invalid_calendar_url');
  const { error } = await supabase.from('calendar_links').upsert({ household_id: householdId, url }, { onConflict: 'household_id' });
  if (error) throw error;
}

export async function removeCalendar(householdId: string): Promise<void> {
  const { error } = await supabase.from('calendar_links').delete().eq('household_id', householdId);
  if (error) throw error;
}

/** De dage i ugen (1 = mandag), hvor kalenderen har noget om aftenen. */
export async function readBusyDays(householdId: string, weekStart: string): Promise<number[]> {
  const { data, error } = await supabase.functions.invoke('read-calendar', { body: { household_id: householdId, week_start: weekStart } });
  if (error) throw error;
  return (data as { busy_days: number[] }).busy_days;
}

/** Fejlkoderne fra funktionen og linket som tekst. */
export async function calendarError(e: unknown): Promise<string> {
  if ((e as Error)?.message === 'invalid_calendar_url') {
    return 'Linket skal være en kalenderadresse, der starter med https:// eller webcal://.';
  }
  const response = (e as { context?: Response }).context;
  const body = response?.json ? await response.json().catch(() => null) : null;
  switch (body?.error) {
    case 'no_calendar':
      return 'Der er ikke gemt en kalender endnu.';
    case 'calendar_unreachable':
      return 'Madro kunne ikke læse kalenderen. Tjek, at linket er den hemmelige iCal-adresse, og prøv igen.';
    default:
      return errorText(e);
  }
}
