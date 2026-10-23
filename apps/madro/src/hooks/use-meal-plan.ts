import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { errorText } from '@/lib/errors';
import {
  fetchDishes,
  fetchPersons,
  fetchRecentDishIds,
  fetchWeekPlan,
  saveWeekPlan,
  type CatalogDish,
  type FamilyMember,
  type WeekPlan,
} from '@/lib/meal-plan';
import { planWeek, swapDay, type PlanInput } from '@/planner/engine';
import { useHousehold } from '@/providers/household';

type MealPlanState = {
  persons: FamilyMember[];
  dishes: Map<string, CatalogDish>;
  plan: WeekPlan | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** Laver og gemmer en ny plan for ugen. */
  makePlan: (busyDays: number[]) => Promise<void>;
  /** Bytter retten på én dag og gemmer planen. */
  swap: (date: string) => Promise<void>;
};

/** Ugens plan for husstanden. Hentes igen, hver gang skærmen kommer i fokus. */
export function useMealPlan(weekStart: string): MealPlanState {
  const { household } = useHousehold();
  const householdId = household?.id;
  const [persons, setPersons] = useState<FamilyMember[]>([]);
  const [dishes, setDishes] = useState<Map<string, CatalogDish>>(new Map());
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const swaps = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let current = true;
      setLoading(true);
      Promise.all([
        fetchPersons(householdId),
        fetchDishes(),
        fetchWeekPlan(householdId, weekStart),
        fetchRecentDishIds(householdId, weekStart),
      ])
        .then(([p, d, w, r]) => {
          if (!current) return;
          setPersons(p);
          setDishes(new Map(d.map((dish) => [dish.id, dish])));
          setPlan(w);
          setRecent(r);
          setError(null);
        })
        .catch((e) => current && setError(errorText(e)))
        .finally(() => current && setLoading(false));
      return () => {
        current = false;
      };
    }, [householdId, weekStart]),
  );

  const input = useCallback(
    (busyDays: number[], seed: string): PlanInput => ({
      weekStart,
      dishes: [...dishes.values()],
      persons,
      busyDays,
      recentDishIds: recent,
      seed,
    }),
    [weekStart, dishes, persons, recent],
  );

  const save = useCallback(
    async (next: WeekPlan) => {
      if (!householdId) return;
      const previous = plan;
      setPlan(next);
      setSaving(true);
      setError(null);
      try {
        await saveWeekPlan(householdId, next);
      } catch (e) {
        setPlan(previous);
        setError(errorText(e));
      } finally {
        setSaving(false);
      }
    },
    [householdId, plan],
  );

  const makePlan = useCallback(
    async (busyDays: number[]) => {
      // Første plan for en uge er altid den samme. En ny plan for samme uge giver nye forslag.
      const seed = plan ? `${householdId}|${weekStart}|${Date.now()}` : `${householdId}|${weekStart}`;
      await save({ weekStart, busyDays, days: planWeek(input(busyDays, seed)) });
    },
    [householdId, weekStart, plan, input, save],
  );

  const swap = useCallback(
    async (date: string) => {
      if (!plan) return;
      swaps.current += 1;
      const seed = `${householdId}|${weekStart}|${Date.now()}`;
      await save({ ...plan, days: swapDay(input(plan.busyDays, seed), plan.days, date, swaps.current) });
    },
    [householdId, weekStart, plan, input, save],
  );

  return { persons, dishes, plan, loading, saving, error, makePlan, swap };
}
