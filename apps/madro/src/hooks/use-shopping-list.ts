import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { errorText } from '@/lib/errors';
import { fetchDishes, fetchWeekPlan, type CatalogDish, type WeekPlan } from '@/lib/meal-plan';
import { fetchShoppingItems, fetchStaples, sendOp, syncShoppingList } from '@/lib/shopping';
import { supabase } from '@/lib/supabase';
import { buildList, categoryOf } from '@/shopping/list';
import { applyAll, enqueue, isNetworkError, newId, type ItemChanges, type Op, type ShoppingItem } from '@/shopping/queue';
import { useHousehold } from '@/providers/household';

/** Hvor tit køen prøves igen, mens der er ændringer, der ikke er sendt. */
const RETRY_MS = 15_000;

const listKey = (household: string, week: string) => `madro:indkob:${household}:${week}`;
const queueKey = (household: string) => `madro:indkob-koe:${household}`;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}

type ShoppingListState = {
  items: ShoppingItem[];
  plan: WeekPlan | null;
  dishes: Map<string, CatalogDish>;
  loading: boolean;
  /** Sidste forsøg på at hente listen fejlede, så den viste liste er den gemte. */
  offline: boolean;
  /** Ændringer, der ikke er sendt endnu. */
  pending: number;
  error: string | null;
  add: (name: string) => void;
  update: (id: string, changes: ItemChanges) => void;
};

/**
 * Ugens indkøbsliste. Laves ud fra planen og de faste varer, opdateres live,
 * når en anden i husstanden ændrer den, og virker uden net.
 */
export function useShoppingList(weekStart: string): ShoppingListState {
  const { household } = useHousehold();
  const householdId = household?.id;
  const [server, setServer] = useState<ShoppingItem[]>([]);
  const [queue, setQueue] = useState<Op[]>([]);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [dishes, setDishes] = useState<Map<string, CatalogDish>>(new Map());
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queueRef = useRef<Op[]>([]);
  const flushing = useRef(false);

  const saveQueue = useCallback(
    (next: Op[]) => {
      queueRef.current = next;
      setQueue(next);
      if (householdId) writeJson(queueKey(householdId), next);
    },
    [householdId],
  );

  const refetch = useCallback(async () => {
    if (!householdId) return;
    try {
      const items = await fetchShoppingItems(householdId, weekStart);
      setServer(items);
      setOffline(false);
      writeJson(listKey(householdId, weekStart), items);
    } catch (e) {
      if (isNetworkError(e)) setOffline(true);
      else setError(errorText(e));
    }
  }, [householdId, weekStart]);

  // Sender ventende ændringer i rækkefølge. Stopper ved netværksfejl og prøver igen senere.
  const flush = useCallback(async () => {
    if (flushing.current || queueRef.current.length === 0) return;
    flushing.current = true;
    try {
      while (queueRef.current.length > 0) {
        const op = queueRef.current[0];
        try {
          await sendOp(op);
        } catch (e) {
          if (isNetworkError(e)) {
            setOffline(true);
            return;
          }
          setError(errorText(e));
        }
        saveQueue(queueRef.current.filter((q) => q !== op));
      }
      setOffline(false);
      await refetch();
    } finally {
      flushing.current = false;
    }
  }, [refetch, saveQueue]);

  // Den gemte liste og kø vises med det samme, også uden net.
  useEffect(() => {
    if (!householdId) return;
    let current = true;
    Promise.all([readJson<ShoppingItem[]>(listKey(householdId, weekStart), []), readJson<Op[]>(queueKey(householdId), [])]).then(
      ([items, ops]) => {
        if (!current) return;
        setServer((now) => (now.length > 0 ? now : items));
        if (queueRef.current.length === 0 && ops.length > 0) {
          queueRef.current = ops;
          setQueue(ops);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [householdId, weekStart]);

  // Lægger ugens plan og de faste varer på listen, hver gang skærmen kommer i fokus.
  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let current = true;
      setLoading(true);
      Promise.all([fetchWeekPlan(householdId, weekStart), fetchDishes(), fetchStaples(householdId)])
        .then(async ([p, d, staples]) => {
          if (!current) return;
          const byId = new Map(d.map((dish) => [dish.id, dish]));
          setPlan(p);
          setDishes(byId);
          const days = (p?.days ?? []).flatMap((day) => {
            const dish = day.dishId ? byId.get(day.dishId) : undefined;
            return dish ? [{ weekday: day.weekday, ingredients: dish.ingredients }] : [];
          });
          await syncShoppingList(householdId, weekStart, buildList(days, staples));
          setError(null);
        })
        .catch((e) => {
          if (!current) return;
          if (isNetworkError(e)) setOffline(true);
          else setError(errorText(e));
        })
        .then(() => (current ? flush() : undefined))
        .then(() => (current ? refetch() : undefined))
        .finally(() => current && setLoading(false));
      return () => {
        current = false;
      };
    }, [householdId, weekStart, flush, refetch]),
  );

  // Live: en ændring fra en anden telefon henter listen igen.
  useEffect(() => {
    if (!householdId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`indkob:${householdId}:${weekStart}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_items', filter: `household_id=eq.${householdId}` },
        () => {
          clearTimeout(timer);
          timer = setTimeout(refetch, 300);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') flush();
      });
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [householdId, weekStart, refetch, flush]);

  // Prøver køen igen, når appen kommer frem, nettet kommer igen, eller med jævne mellemrum.
  useEffect(() => {
    if (queue.length === 0) return;
    const interval = setInterval(flush, RETRY_MS);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && flush());
    const online = () => flush();
    globalThis.addEventListener?.('online', online);
    return () => {
      clearInterval(interval);
      sub.remove();
      globalThis.removeEventListener?.('online', online);
    };
  }, [queue.length, flush]);

  const push = useCallback(
    (op: Op) => {
      saveQueue(enqueue(queueRef.current, op));
      flush();
    },
    [saveQueue, flush],
  );

  const add = useCallback(
    (name: string) => {
      const clean = name.trim();
      if (!clean || !householdId) return;
      push({ kind: 'add', id: newId(), household: householdId, week: weekStart, name: clean, category: categoryOf(clean) });
    },
    [householdId, weekStart, push],
  );

  const update = useCallback((id: string, changes: ItemChanges) => push({ kind: 'update', id, changes }), [push]);

  // Ventende ændringer lægges oven på det, der sidst blev hentet.
  const items = applyAll(server, queue.filter((op) => op.kind === 'update' || op.week === weekStart));

  return { items, plan, dishes, loading, offline, pending: queue.length, error, add, update };
}
