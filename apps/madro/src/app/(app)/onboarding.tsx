import { useState } from 'react';

import { pendingInvitation } from '@/lib/pending-invitation';
import { Onboarding } from '@/screens/onboarding';

export default function OnboardingRoute() {
  const [token] = useState(() => pendingInvitation.take());
  return <Onboarding initialToken={token} />;
}
