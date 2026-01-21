import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { PURCHASES_CONFIG } from "./purchases.config";

const TRIAL_START_KEY = "airfax_trial_start";
const IS_PRO_KEY = "airfax_is_pro";

async function getSecureValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
}

async function setSecureValue(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

export async function getTrialStartDate(): Promise<Date | null> {
  const stored = await getSecureValue(TRIAL_START_KEY);
  if (!stored) return null;
  return new Date(stored);
}

export async function initializeTrialIfNeeded(): Promise<void> {
  const existing = await getTrialStartDate();
  if (!existing) {
    await setSecureValue(TRIAL_START_KEY, new Date().toISOString());
  }
}

export async function getTrialDaysRemaining(): Promise<number> {
  const startDate = await getTrialStartDate();
  if (!startDate) {
    await initializeTrialIfNeeded();
    return PURCHASES_CONFIG.TRIAL_DAYS;
  }

  const trialEndsAt = new Date(
    startDate.getTime() + PURCHASES_CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000
  );
  const now = new Date();
  const remainingMs = trialEndsAt.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return 0;
  }

  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

export async function isTrialActive(): Promise<boolean> {
  const remaining = await getTrialDaysRemaining();
  return remaining > 0;
}

export async function getIsPro(): Promise<boolean> {
  const stored = await getSecureValue(IS_PRO_KEY);
  return stored === "true";
}

export async function setIsPro(value: boolean): Promise<void> {
  await setSecureValue(IS_PRO_KEY, value ? "true" : "false");
}

export async function canEdit(): Promise<boolean> {
  const isPro = await getIsPro();
  if (isPro) return true;
  const trialActive = await isTrialActive();
  return trialActive;
}

export interface EntitlementState {
  isPro: boolean;
  trialActive: boolean;
  trialExpired: boolean;
  trialDaysRemaining: number;
  canEdit: boolean;
}

export async function getEntitlementState(): Promise<EntitlementState> {
  const isPro = await getIsPro();
  const trialDaysRemaining = await getTrialDaysRemaining();
  const trialActive = trialDaysRemaining > 0;
  const trialExpired = !trialActive;
  const canEditValue = isPro || trialActive;

  return {
    isPro,
    trialActive,
    trialExpired,
    trialDaysRemaining,
    canEdit: canEditValue,
  };
}
