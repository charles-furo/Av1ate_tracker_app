import { PURCHASES_CONFIG } from "./purchases.config";

export interface TrialStatus {
  trialActive: boolean;
  trialExpired: boolean;
  remainingDays: number;
  trialEndsAtISO: string | null;
}

export function getTrialStatus(trialStartAtISO: string | null): TrialStatus {
  if (!trialStartAtISO) {
    return {
      trialActive: true,
      trialExpired: false,
      remainingDays: PURCHASES_CONFIG.TRIAL_DAYS,
      trialEndsAtISO: null,
    };
  }

  const trialStartAt = new Date(trialStartAtISO);
  const trialEndsAt = new Date(
    trialStartAt.getTime() + PURCHASES_CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000
  );
  const now = new Date();
  const remainingMs = trialEndsAt.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return {
      trialActive: false,
      trialExpired: true,
      remainingDays: 0,
      trialEndsAtISO: trialEndsAt.toISOString(),
    };
  }

  const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

  return {
    trialActive: true,
    trialExpired: false,
    remainingDays,
    trialEndsAtISO: trialEndsAt.toISOString(),
  };
}
