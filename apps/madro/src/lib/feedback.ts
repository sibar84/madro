import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export const FEEDBACK_MAX = 2000;

/** Gemmer en besked fra en tester. Afsenderen sætter databasen selv. */
export async function sendFeedback(householdId: string | null, message: string): Promise<void> {
  const { error } = await supabase
    .from('feedback')
    .insert({ household_id: householdId, message: message.trim(), platform: Platform.OS });
  if (error) throw error;
}
