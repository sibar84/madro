import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

export type Role = 'owner' | 'adult' | 'teen';

export type Household = {
  id: string;
  name: string;
  role: Role;
};

type HouseholdState = {
  household: Household | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

type Loaded = { userId: string; household: Household | null };

type MembershipRow = { role: Role; households: { id: string; name: string } | null };

const HouseholdContext = createContext<HouseholdState>({
  household: null,
  loading: true,
  refresh: async () => {},
});

// Version 1 har én husstand pr. bruger. Datamodellen tillader flere senere.
async function fetchHousehold(userId: string): Promise<Loaded> {
  const { data, error } = await supabase
    .from('memberships')
    .select('role, households (id, name)')
    .eq('user_id', userId)
    .order('created_at')
    .limit(1)
    .maybeSingle<MembershipRow>();
  if (error) console.warn('Kunne ikke hente husstand', error.message);
  return { userId, household: data?.households ? { ...data.households, role: data.role } : null };
}

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id;
  // Husker hvilken bruger husstanden er hentet for, så et brugerskift viser indlæsning.
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    fetchHousehold(userId).then((result) => {
      if (current) setLoaded(result);
    });
    return () => {
      current = false;
    };
  }, [userId]);

  const refresh = useCallback(async () => {
    if (userId) setLoaded(await fetchHousehold(userId));
  }, [userId]);

  const loading = !!userId && loaded?.userId !== userId;
  const household = loading ? null : (loaded?.household ?? null);

  return (
    <HouseholdContext.Provider value={{ household, loading, refresh }}>{children}</HouseholdContext.Provider>
  );
}

export const useHousehold = () => useContext(HouseholdContext);
