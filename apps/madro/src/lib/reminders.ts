import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import type { Reminder } from '@/kitchen/timing';

const KEY = 'madro:paamindelser';

// Påmindelser vises også, mens appen er åben.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const remindersSupported = true;

export async function remindersEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY).catch(() => null)) === 'on';
}

/** Slår påmindelser til eller fra på denne telefon. Returnerer false, hvis tilladelsen blev afvist. */
export async function setRemindersEnabled(on: boolean): Promise<boolean> {
  if (on) {
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return false;
  }
  await AsyncStorage.setItem(KEY, on ? 'on' : 'off');
  if (!on) await clearReminders();
  return true;
}

async function clearReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith('madro-'))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Erstatter Madros påmindelser med ugens, hvis de er slået til. */
export async function scheduleReminders(reminders: Reminder[]): Promise<void> {
  if (!(await remindersEnabled())) return;
  await clearReminders();
  await Promise.all(
    reminders.map((r) =>
      Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
      }),
    ),
  );
}
