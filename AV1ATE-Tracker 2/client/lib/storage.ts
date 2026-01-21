import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  Aircraft,
  CurrentHours,
  Thresholds,
  MaintenanceItem,
  Document,
  NotificationState,
  MultiAircraftData,
  AppData,
} from "@/types/data";

const STORAGE_KEY = "@airfax_data";
const MULTI_AIRCRAFT_KEY = "@airfax_multi_aircraft";
const MIGRATION_DONE_KEY = "@airfax_migration_v2_done";

const DEFAULT_THRESHOLDS: Thresholds = {
  dateThresholdDays: [30, 10, 3],
  hourThresholds: [10, 5, 1],
};

const DEFAULT_CURRENT: CurrentHours = {
  hobbs: 0,
  tach: 0,
  updatedAt: new Date().toISOString(),
};

const DEFAULT_MAINTENANCE_ITEMS: MaintenanceItem[] = [
  {
    id: "1",
    name: "Annual Inspection",
    ruleType: "DATE",
    intervalDays: 365,
    lastCompletedAt: new Date(Date.now() - 342 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    name: "Oil Change",
    ruleType: "HOURS",
    intervalHours: 50,
    hourSource: "HOBBS",
    lastCompletedHours: 0,
  },
  {
    id: "3",
    name: "ELT Battery",
    ruleType: "DATE",
    intervalDays: 730,
    lastCompletedAt: new Date(Date.now() - 600 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "4",
    name: "Transponder Check",
    ruleType: "DATE",
    intervalDays: 730,
    lastCompletedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "5",
    name: "Pitot-Static Check",
    ruleType: "DATE",
    intervalDays: 730,
    lastCompletedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function createDefaultAircraft(tail: string = "N12345", model: string = "Aircraft"): Aircraft {
  return {
    id: generateId(),
    tail,
    model,
    hourMode: "BOTH",
    current: deepClone(DEFAULT_CURRENT),
    thresholds: deepClone(DEFAULT_THRESHOLDS),
    maintenanceItems: deepClone(DEFAULT_MAINTENANCE_ITEMS),
    documents: [],
  };
}

async function migrateFromLegacyData(): Promise<MultiAircraftData | null> {
  try {
    const migrationDone = await AsyncStorage.getItem(MIGRATION_DONE_KEY);
    if (migrationDone === "true") {
      return null;
    }

    const legacyData = await AsyncStorage.getItem(STORAGE_KEY);
    if (!legacyData) {
      await AsyncStorage.setItem(MIGRATION_DONE_KEY, "true");
      return null;
    }

    const parsed = JSON.parse(legacyData) as AppData;
    
    const migratedAircraft: Aircraft = {
      id: generateId(),
      tail: parsed.aircraft?.tail || "N28PA",
      model: parsed.aircraft?.model || "Piper PA-28",
      hourMode: parsed.aircraft?.hourMode || "BOTH",
      current: parsed.current || deepClone(DEFAULT_CURRENT),
      thresholds: { ...deepClone(DEFAULT_THRESHOLDS), ...(parsed.thresholds || {}) },
      maintenanceItems: parsed.maintenanceItems || deepClone(DEFAULT_MAINTENANCE_ITEMS),
      documents: parsed.documents || [],
    };

    const multiData: MultiAircraftData = {
      aircraftList: [migratedAircraft],
      activeAircraftId: migratedAircraft.id,
      notificationState: parsed.notificationState || { lastNotifiedStatus: {} },
      notificationsEnabled: parsed.notificationsEnabled ?? false,
    };

    await saveMultiAircraftData(multiData);
    await AsyncStorage.setItem(MIGRATION_DONE_KEY, "true");
    
    return multiData;
  } catch (error) {
    console.error("Error during migration:", error);
    return null;
  }
}

export async function loadMultiAircraftData(): Promise<MultiAircraftData> {
  try {
    const migratedData = await migrateFromLegacyData();
    if (migratedData) {
      return migratedData;
    }

    const stored = await AsyncStorage.getItem(MULTI_AIRCRAFT_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as MultiAircraftData;
      if (parsed.aircraftList && parsed.aircraftList.length > 0) {
        return parsed;
      }
    }

    const defaultAircraft = createDefaultAircraft("N28PA", "Piper PA-28");
    defaultAircraft.current = {
      hobbs: 1243.6,
      tach: 1189.2,
      updatedAt: new Date().toISOString(),
    };
    defaultAircraft.maintenanceItems[1].lastCompletedHours = 1200;
    
    const defaultData: MultiAircraftData = {
      aircraftList: [defaultAircraft],
      activeAircraftId: defaultAircraft.id,
      notificationState: { lastNotifiedStatus: {} },
      notificationsEnabled: false,
    };
    
    await saveMultiAircraftData(defaultData);
    return defaultData;
  } catch (error) {
    console.error("Error loading multi-aircraft data:", error);
    const fallbackAircraft = createDefaultAircraft("N28PA", "Piper PA-28");
    return {
      aircraftList: [fallbackAircraft],
      activeAircraftId: fallbackAircraft.id,
      notificationState: { lastNotifiedStatus: {} },
      notificationsEnabled: false,
    };
  }
}

export async function saveMultiAircraftData(data: MultiAircraftData): Promise<void> {
  try {
    await AsyncStorage.setItem(MULTI_AIRCRAFT_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Error saving multi-aircraft data:", error);
  }
}

export async function addAircraft(aircraft: Omit<Aircraft, "id" | "thresholds" | "maintenanceItems" | "documents">): Promise<Aircraft> {
  const data = await loadMultiAircraftData();
  
  const newAircraft: Aircraft = {
    ...aircraft,
    id: generateId(),
    thresholds: deepClone(DEFAULT_THRESHOLDS),
    maintenanceItems: [],
    documents: [],
  };
  
  data.aircraftList.push(newAircraft);
  data.activeAircraftId = newAircraft.id;
  
  await saveMultiAircraftData(data);
  return newAircraft;
}

export async function updateAircraft(aircraft: Aircraft): Promise<void> {
  const data = await loadMultiAircraftData();
  const index = data.aircraftList.findIndex((a) => a.id === aircraft.id);
  if (index >= 0) {
    data.aircraftList[index] = aircraft;
    await saveMultiAircraftData(data);
  }
}

export async function deleteAircraft(id: string): Promise<boolean> {
  const data = await loadMultiAircraftData();
  
  if (data.aircraftList.length <= 1) {
    return false;
  }
  
  data.aircraftList = data.aircraftList.filter((a) => a.id !== id);
  
  if (data.activeAircraftId === id) {
    data.activeAircraftId = data.aircraftList[0].id;
  }
  
  await saveMultiAircraftData(data);
  return true;
}

export async function setActiveAircraft(id: string): Promise<void> {
  const data = await loadMultiAircraftData();
  if (data.aircraftList.some((a) => a.id === id)) {
    data.activeAircraftId = id;
    await saveMultiAircraftData(data);
  }
}

export async function getActiveAircraft(): Promise<Aircraft | null> {
  const data = await loadMultiAircraftData();
  return data.aircraftList.find((a) => a.id === data.activeAircraftId) || null;
}

export async function updateActiveAircraftHours(current: CurrentHours): Promise<void> {
  const data = await loadMultiAircraftData();
  const aircraft = data.aircraftList.find((a) => a.id === data.activeAircraftId);
  if (aircraft) {
    aircraft.current = current;
    await saveMultiAircraftData(data);
  }
}

export async function updateActiveAircraftThresholds(thresholds: Thresholds): Promise<void> {
  const data = await loadMultiAircraftData();
  const aircraft = data.aircraftList.find((a) => a.id === data.activeAircraftId);
  if (aircraft) {
    aircraft.thresholds = thresholds;
    await saveMultiAircraftData(data);
  }
}

export async function addMaintenanceItemToActiveAircraft(item: Omit<MaintenanceItem, "id">): Promise<MaintenanceItem> {
  const data = await loadMultiAircraftData();
  const aircraft = data.aircraftList.find((a) => a.id === data.activeAircraftId);
  if (!aircraft) throw new Error("No active aircraft");
  
  const newItem: MaintenanceItem = { ...item, id: generateId() };
  aircraft.maintenanceItems.push(newItem);
  await saveMultiAircraftData(data);
  return newItem;
}

export async function updateMaintenanceItemOnActiveAircraft(item: MaintenanceItem): Promise<void> {
  const data = await loadMultiAircraftData();
  const aircraft = data.aircraftList.find((a) => a.id === data.activeAircraftId);
  if (!aircraft) return;
  
  const index = aircraft.maintenanceItems.findIndex((i) => i.id === item.id);
  if (index >= 0) {
    aircraft.maintenanceItems[index] = item;
  }
  await saveMultiAircraftData(data);
}

export async function deleteMaintenanceItemFromActiveAircraft(id: string): Promise<void> {
  const data = await loadMultiAircraftData();
  const aircraft = data.aircraftList.find((a) => a.id === data.activeAircraftId);
  if (!aircraft) return;
  
  aircraft.maintenanceItems = aircraft.maintenanceItems.filter((i) => i.id !== id);
  await saveMultiAircraftData(data);
}

export async function addDocumentToActiveAircraft(doc: Omit<Document, "id" | "addedAt">): Promise<Document> {
  const data = await loadMultiAircraftData();
  const aircraft = data.aircraftList.find((a) => a.id === data.activeAircraftId);
  if (!aircraft) throw new Error("No active aircraft");
  
  const newDoc: Document = {
    ...doc,
    id: generateId(),
    addedAt: new Date().toISOString(),
  };
  aircraft.documents.push(newDoc);
  await saveMultiAircraftData(data);
  return newDoc;
}

export async function updateDocumentOnActiveAircraft(doc: Document): Promise<void> {
  const data = await loadMultiAircraftData();
  const aircraft = data.aircraftList.find((a) => a.id === data.activeAircraftId);
  if (!aircraft) return;
  
  const index = aircraft.documents.findIndex((d) => d.id === doc.id);
  if (index >= 0) {
    aircraft.documents[index] = doc;
  }
  await saveMultiAircraftData(data);
}

export async function deleteDocumentFromActiveAircraft(id: string): Promise<void> {
  const data = await loadMultiAircraftData();
  const aircraft = data.aircraftList.find((a) => a.id === data.activeAircraftId);
  if (!aircraft) return;
  
  aircraft.documents = aircraft.documents.filter((d) => d.id !== id);
  await saveMultiAircraftData(data);
}

export async function updateNotificationState(state: NotificationState): Promise<void> {
  const data = await loadMultiAircraftData();
  data.notificationState = state;
  await saveMultiAircraftData(data);
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  const data = await loadMultiAircraftData();
  data.notificationsEnabled = enabled;
  await saveMultiAircraftData(data);
}

export async function loadAppData(): Promise<AppData> {
  const data = await loadMultiAircraftData();
  const aircraft = data.aircraftList.find((a) => a.id === data.activeAircraftId) || data.aircraftList[0];
  
  return {
    aircraft: {
      model: aircraft.model,
      tail: aircraft.tail,
      hourMode: aircraft.hourMode,
    },
    current: aircraft.current,
    thresholds: aircraft.thresholds,
    maintenanceItems: aircraft.maintenanceItems,
    documents: aircraft.documents,
    notificationState: data.notificationState,
    notificationsEnabled: data.notificationsEnabled,
  };
}

export async function saveAppData(appData: AppData): Promise<void> {
  const data = await loadMultiAircraftData();
  const aircraft = data.aircraftList.find((a) => a.id === data.activeAircraftId);
  if (!aircraft) return;
  
  aircraft.model = appData.aircraft.model;
  aircraft.tail = appData.aircraft.tail;
  aircraft.hourMode = appData.aircraft.hourMode;
  aircraft.current = appData.current;
  aircraft.thresholds = appData.thresholds;
  aircraft.maintenanceItems = appData.maintenanceItems;
  aircraft.documents = appData.documents;
  data.notificationState = appData.notificationState;
  data.notificationsEnabled = appData.notificationsEnabled;
  
  await saveMultiAircraftData(data);
}
