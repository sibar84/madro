// En invitation fra et link huskes, mens brugeren logger ind, og bruges i onboarding.
let pending: string | undefined;

export const pendingInvitation = {
  set(token: string) {
    pending = token;
  },
  take() {
    const token = pending;
    pending = undefined;
    return token;
  },
};
