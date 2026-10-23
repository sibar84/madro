import { Redirect, useLocalSearchParams } from 'expo-router';

import { pendingInvitation } from '@/lib/pending-invitation';

// madro://invitation?token=…
export default function InvitationRoute() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  if (token) pendingInvitation.set(token);
  return <Redirect href="/" />;
}
