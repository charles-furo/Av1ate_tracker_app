import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import type { ComputedStatus, NotificationState, MaintenanceItem } from "@/types/data";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const NOTIFICATION_PREFIX = "av1ate_maintenance_";
const DUE_SOON_SUFFIX = "_due_soon";
const OVERDUE_SUFFIX = "_overdue";

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

function getNotificationId(itemId: string, type: "due_soon" | "overdue"): string {
  return `${NOTIFICATION_PREFIX}${itemId}${type === "due_soon" ? DUE_SOON_SUFFIX : OVERDUE_SUFFIX}`;
}

function formatDueText(status: ComputedStatus): string {
  const { item, daysRemaining, hoursRemaining } = status;
  
  if (hoursRemaining !== undefined && hoursRemaining >= 0) {
    return `${item.name} due in ${Math.round(hoursRemaining)}h`;
  }
  
  if (daysRemaining !== undefined && daysRemaining >= 0) {
    return `${item.name} due in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`;
  }
  
  return `${item.name} is due`;
}

function formatOverdueText(item: MaintenanceItem): string {
  return `${item.name} is overdue`;
}

export async function cancelItemNotifications(itemId: string): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  
  try {
    await Notifications.cancelScheduledNotificationAsync(getNotificationId(itemId, "due_soon"));
  } catch {}
  
  try {
    await Notifications.cancelScheduledNotificationAsync(getNotificationId(itemId, "overdue"));
  } catch {}
}

export async function cancelAllMaintenanceNotifications(): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduled) {
      if (notification.identifier.startsWith(NOTIFICATION_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch (error) {
    console.error("Error cancelling notifications:", error);
  }
}

export async function scheduleMaintenanceNotifications(
  statuses: ComputedStatus[],
): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }

  await cancelAllMaintenanceNotifications();

  for (const status of statuses) {
    const { item, dueDate, daysRemaining, hoursRemaining } = status;
    const deepLink = Linking.createURL(`/maintenance/${item.id}`);

    if (status.status === "overdue") {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: getNotificationId(item.id, "overdue"),
          content: {
            title: "Overdue",
            body: formatOverdueText(item),
            data: { itemId: item.id, deepLink },
          },
          trigger: null,
        });
      } catch (error) {
        console.error("Error scheduling overdue notification:", error);
      }
    } else if (status.status === "due_soon") {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: getNotificationId(item.id, "due_soon"),
          content: {
            title: "Due soon",
            body: formatDueText(status),
            data: { itemId: item.id, deepLink },
          },
          trigger: null,
        });
      } catch (error) {
        console.error("Error scheduling due soon notification:", error);
      }
    }
  }
}

export async function scheduleMaintenanceNotification(
  item: ComputedStatus,
): Promise<string | null> {
  if (Platform.OS === "web") {
    return null;
  }

  try {
    const deepLink = Linking.createURL(`/maintenance/${item.item.id}`);
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: item.status === "overdue" ? "Overdue" : "Due soon",
        body: item.status === "overdue" 
          ? formatOverdueText(item.item) 
          : formatDueText(item),
        data: { itemId: item.item.id, deepLink },
      },
      trigger: null,
    });
    return identifier;
  } catch (error) {
    console.error("Error scheduling notification:", error);
    return null;
  }
}

export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export function getStatusChanges(
  currentStatuses: ComputedStatus[],
  previousState: NotificationState,
): ComputedStatus[] {
  const changed: ComputedStatus[] = [];

  for (const status of currentStatuses) {
    const previousStatus = previousState.lastNotifiedStatus[status.item.id];

    if (status.status === "overdue" && previousStatus !== "overdue") {
      changed.push(status);
    } else if (
      status.status === "due_soon" &&
      previousStatus !== "due_soon" &&
      previousStatus !== "overdue"
    ) {
      changed.push(status);
    }
  }

  return changed;
}

export function createNotificationState(
  statuses: ComputedStatus[],
): NotificationState {
  const lastNotifiedStatus: Record<string, "good" | "due_soon" | "overdue"> = {};

  for (const status of statuses) {
    lastNotifiedStatus[status.item.id] = status.status;
  }

  return {
    lastNotifiedStatus,
    lastWeeklyDigest: new Date().toISOString(),
  };
}

export async function sendDueSoonNotifications(
  statuses: ComputedStatus[],
  previousState: NotificationState,
): Promise<NotificationState> {
  const changed = getStatusChanges(statuses, previousState);

  for (const status of changed) {
    await scheduleMaintenanceNotification(status);
  }

  const updatedState: NotificationState = {
    ...previousState,
    lastNotifiedStatus: { ...previousState.lastNotifiedStatus },
  };

  for (const status of statuses) {
    updatedState.lastNotifiedStatus[status.item.id] = status.status;
  }

  return updatedState;
}

export async function sendWeeklyDigest(
  statuses: ComputedStatus[],
  aircraftTail: string,
): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }

  const dueSoon = statuses.filter((s) => s.status === "due_soon");
  const overdue = statuses.filter((s) => s.status === "overdue");

  if (dueSoon.length === 0 && overdue.length === 0) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Weekly Summary: ${aircraftTail}`,
        body: "All maintenance items are current. Great job!",
      },
      trigger: null,
    });
    return;
  }

  let body = "";
  if (overdue.length > 0) {
    body += `${overdue.length} overdue. `;
  }
  if (dueSoon.length > 0) {
    body += `${dueSoon.length} due soon.`;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Weekly Summary: ${aircraftTail}`,
      body: body.trim(),
    },
    trigger: null,
  });
}

export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void,
): () => void {
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      onNotificationReceived?.(notification);
    },
  );

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;
      if (data?.deepLink) {
        Linking.openURL(data.deepLink as string).catch(() => {});
      }
      onNotificationResponse?.(response);
    },
  );

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}
