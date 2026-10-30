import type { Reminder } from '@/kitchen/timing';

// En browser kan ikke give besked på et bestemt tidspunkt, når siden er lukket.
// Påmindelser findes derfor kun i appen på telefonen.
export const remindersSupported = false;

export async function remindersEnabled(): Promise<boolean> {
  return false;
}

export async function setRemindersEnabled(_on: boolean): Promise<boolean> {
  return false;
}

export async function scheduleReminders(_reminders: Reminder[]): Promise<void> {}
