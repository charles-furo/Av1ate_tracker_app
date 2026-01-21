import { Platform, Alert } from "react-native";
import Constants from "expo-constants";
import { PURCHASES_CONFIG } from "./purchases.config";
import { setIsPro, getIsPro } from "./entitlement";

let purchasesInitialized = false;
let Purchases: any = null;
let cachedProductPrice: string | null = null;

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

async function loadPurchasesModule(): Promise<any> {
  try {
    const rcModule = require("react-native-purchases");
    return rcModule.default || rcModule;
  } catch {
    return null;
  }
}

export async function initPurchases(): Promise<void> {
  if (purchasesInitialized) return;

  const apiKey =
    Platform.OS === "ios"
      ? PURCHASES_CONFIG.REVENUECAT_IOS_API_KEY
      : PURCHASES_CONFIG.REVENUECAT_ANDROID_API_KEY;

  if (!apiKey) {
    console.warn(
      "[Purchases] RevenueCat API key not configured. IAP will not work. " +
        "Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY or EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY."
    );
    return;
  }

  if (Platform.OS === "web") {
    console.warn("[Purchases] IAP not available on web platform.");
    return;
  }

  try {
    Purchases = await loadPurchasesModule();
    if (!Purchases) {
      console.warn(
        "[Purchases] react-native-purchases not available. IAP requires an EAS development build."
      );
      return;
    }

    await Purchases.configure({ apiKey });
    purchasesInitialized = true;
    console.log("[Purchases] RevenueCat initialized successfully.");

    await checkAndSyncEntitlement();
  } catch (error) {
    console.warn(
      "[Purchases] Failed to initialize RevenueCat. IAP requires an EAS development build.",
      error
    );
  }
}

export async function checkAndSyncEntitlement(): Promise<boolean> {
  if (!Purchases || !purchasesInitialized) {
    return getIsPro();
  }

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[PURCHASES_CONFIG.ENTITLEMENT_ID];
    const hasEntitlement = !!entitlement;

    if (hasEntitlement) {
      await setIsPro(true);
    }

    return hasEntitlement || (await getIsPro());
  } catch (error) {
    console.warn("[Purchases] Failed to check entitlement:", error);
    return getIsPro();
  }
}

export function isPurchasesAvailable(): boolean {
  return purchasesInitialized && Purchases !== null && !isExpoGo();
}

export function isRunningInExpoGo(): boolean {
  return isExpoGo();
}

export interface ProductInfo {
  available: boolean;
  price: string;
  error?: string;
}

export async function getProductInfo(): Promise<ProductInfo> {
  if (isExpoGo() || Platform.OS === "web") {
    return {
      available: false,
      price: PURCHASES_CONFIG.DEFAULT_PRICE,
    };
  }

  if (!Purchases || !purchasesInitialized) {
    return {
      available: false,
      price: PURCHASES_CONFIG.DEFAULT_PRICE,
      error: "Store unavailable. Try again.",
    };
  }

  try {
    const productId =
      Platform.OS === "ios"
        ? PURCHASES_CONFIG.PRODUCT_IDS.IOS
        : PURCHASES_CONFIG.PRODUCT_IDS.ANDROID;

    const products = await Purchases.getProducts([productId]);

    if (!products || products.length === 0) {
      return {
        available: false,
        price: PURCHASES_CONFIG.DEFAULT_PRICE,
        error: "Store unavailable. Try again.",
      };
    }

    const product = products[0];
    const priceString = product.priceString || PURCHASES_CONFIG.DEFAULT_PRICE;
    cachedProductPrice = priceString;

    return {
      available: true,
      price: priceString,
    };
  } catch (error) {
    console.warn("[Purchases] Failed to get product info:", error);
    return {
      available: false,
      price: PURCHASES_CONFIG.DEFAULT_PRICE,
      error: "Store unavailable. Try again.",
    };
  }
}

export function getCachedPrice(): string {
  return cachedProductPrice || PURCHASES_CONFIG.DEFAULT_PRICE;
}

export async function purchaseLifetime(): Promise<boolean> {
  if (isExpoGo()) {
    Alert.alert(
      "Purchases unavailable",
      "Purchases work in the App Store/TestFlight build. Please install the TestFlight version to unlock.",
      [{ text: "OK" }]
    );
    return false;
  }

  if (!Purchases || !purchasesInitialized) {
    Alert.alert(
      "Purchases unavailable",
      "Purchases work in the App Store/TestFlight build. Please install the TestFlight version to unlock.",
      [{ text: "OK" }]
    );
    return false;
  }

  try {
    const productId =
      Platform.OS === "ios"
        ? PURCHASES_CONFIG.PRODUCT_IDS.IOS
        : PURCHASES_CONFIG.PRODUCT_IDS.ANDROID;

    const { customerInfo } = await Purchases.purchaseProduct(productId);
    const entitlement = customerInfo.entitlements.active[PURCHASES_CONFIG.ENTITLEMENT_ID];

    if (entitlement) {
      await setIsPro(true);
      return true;
    }

    return false;
  } catch (error: any) {
    if (error.userCancelled) {
      return false;
    }

    Alert.alert("Purchase Failed", "Purchase failed. Please try again.");
    console.error("[Purchases] Purchase error:", error);
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (isExpoGo()) {
    Alert.alert(
      "Purchases unavailable",
      "Purchases work in the App Store/TestFlight build. Please install the TestFlight version to restore purchases.",
      [{ text: "OK" }]
    );
    return false;
  }

  if (!Purchases || !purchasesInitialized) {
    Alert.alert(
      "Purchases unavailable",
      "Purchases work in the App Store/TestFlight build. Please install the TestFlight version to restore purchases.",
      [{ text: "OK" }]
    );
    return false;
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    const entitlement = customerInfo.entitlements.active[PURCHASES_CONFIG.ENTITLEMENT_ID];

    if (entitlement) {
      await setIsPro(true);
      Alert.alert("Restored", "Your purchase has been restored successfully!");
      return true;
    } else {
      Alert.alert("No Purchase Found", "We couldn't find any previous purchases to restore.");
      return false;
    }
  } catch (error: any) {
    Alert.alert("Restore Failed", "Restore failed. Please try again.");
    console.error("[Purchases] Restore error:", error);
    return false;
  }
}
