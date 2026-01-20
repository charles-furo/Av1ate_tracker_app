import type {
  MaintenanceItem,
  CurrentHours,
  Thresholds,
  StatusType,
  ComputedStatus,
  HourMode,
} from "@/types/data";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysBetween(date1: Date, date2: Date): number {
  const diffTime = date2.getTime() - date1.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getStatusFromDays(
  daysRemaining: number,
  thresholds: number[],
): StatusType {
  if (daysRemaining < 0) return "overdue";
  const sortedThresholds = [...thresholds].sort((a, b) => b - a);
  for (const threshold of sortedThresholds) {
    if (daysRemaining <= threshold) return "due_soon";
  }
  return "good";
}

function getStatusFromHours(
  hoursRemaining: number,
  thresholds: number[],
): StatusType {
  if (hoursRemaining < 0) return "overdue";
  const sortedThresholds = [...thresholds].sort((a, b) => b - a);
  for (const threshold of sortedThresholds) {
    if (hoursRemaining <= threshold) return "due_soon";
  }
  return "good";
}

function combineStatuses(status1: StatusType, status2: StatusType): StatusType {
  if (status1 === "overdue" || status2 === "overdue") return "overdue";
  if (status1 === "due_soon" || status2 === "due_soon") return "due_soon";
  return "good";
}

function formatDueText(
  daysRemaining?: number,
  hoursRemaining?: number,
  ruleType?: string,
): string {
  const parts: string[] = [];

  if (daysRemaining !== undefined) {
    if (daysRemaining < 0) {
      parts.push(`${Math.abs(daysRemaining)} days overdue`);
    } else if (daysRemaining === 0) {
      parts.push("due today");
    } else if (daysRemaining === 1) {
      parts.push("due tomorrow");
    } else if (daysRemaining < 30) {
      parts.push(`due in ${daysRemaining} days`);
    } else {
      const months = Math.round(daysRemaining / 30);
      parts.push(`due in ${months} month${months > 1 ? "s" : ""}`);
    }
  }

  if (hoursRemaining !== undefined) {
    if (hoursRemaining < 0) {
      parts.push(`${Math.abs(hoursRemaining).toFixed(1)} hours overdue`);
    } else {
      parts.push(`due in ${hoursRemaining.toFixed(1)} hours`);
    }
  }

  if (parts.length === 0) return "status unknown";
  if (parts.length === 1) return parts[0];
  return parts.join(" or ");
}

function calculateUrgencyScore(
  status: StatusType,
  daysRemaining?: number,
  hoursRemaining?: number,
): number {
  let score = 0;
  if (status === "overdue") score += 10000;
  else if (status === "due_soon") score += 5000;

  if (daysRemaining !== undefined) {
    score += 1000 - Math.min(daysRemaining, 1000);
  }
  if (hoursRemaining !== undefined) {
    score += 100 - Math.min(hoursRemaining, 100);
  }
  return score;
}

export function computeItemStatus(
  item: MaintenanceItem,
  current: CurrentHours,
  thresholds: Thresholds,
  hourMode: HourMode,
): ComputedStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let dueDate: Date | undefined;
  let dueHours: number | undefined;
  let daysRemaining: number | undefined;
  let hoursRemaining: number | undefined;
  let dateStatus: StatusType = "good";
  let hoursStatus: StatusType = "good";

  if (
    (item.ruleType === "DATE" || item.ruleType === "DATE_OR_HOURS") &&
    item.intervalDays &&
    item.lastCompletedAt
  ) {
    const lastCompleted = new Date(item.lastCompletedAt);
    dueDate = addDays(lastCompleted, item.intervalDays);
    daysRemaining = daysBetween(today, dueDate);
    dateStatus = getStatusFromDays(daysRemaining, thresholds.dateThresholdDays);
  }

  if (
    (item.ruleType === "HOURS" || item.ruleType === "DATE_OR_HOURS") &&
    item.intervalHours !== undefined &&
    item.lastCompletedHours !== undefined
  ) {
    dueHours = item.lastCompletedHours + item.intervalHours;
    const sourceHours = item.hourSource === "TACH" ? current.tach : current.hobbs;
    if (sourceHours !== undefined) {
      hoursRemaining = dueHours - sourceHours;
      hoursStatus = getStatusFromHours(hoursRemaining, thresholds.hourThresholds);
    }
  }

  let status: StatusType;
  if (item.ruleType === "DATE") {
    status = dateStatus;
  } else if (item.ruleType === "HOURS") {
    status = hoursStatus;
  } else {
    status = combineStatuses(dateStatus, hoursStatus);
  }

  const dueText = formatDueText(daysRemaining, hoursRemaining, item.ruleType);
  const urgencyScore = calculateUrgencyScore(status, daysRemaining, hoursRemaining);

  return {
    item,
    status,
    dueDate,
    dueHours,
    daysRemaining,
    hoursRemaining,
    dueText,
    urgencyScore,
  };
}

export function computeAllStatuses(
  items: MaintenanceItem[],
  current: CurrentHours,
  thresholds: Thresholds,
  hourMode: HourMode,
): ComputedStatus[] {
  return items
    .map((item) => computeItemStatus(item, current, thresholds, hourMode))
    .sort((a, b) => b.urgencyScore - a.urgencyScore);
}

export function getOverallStatus(statuses: ComputedStatus[]): StatusType {
  if (statuses.some((s) => s.status === "overdue")) return "overdue";
  if (statuses.some((s) => s.status === "due_soon")) return "due_soon";
  return "good";
}

export function getStatusColor(status: StatusType, colors: {
  statusGreen: string;
  statusYellow: string;
  statusRed: string;
}): string {
  switch (status) {
    case "good":
      return colors.statusGreen;
    case "due_soon":
      return colors.statusYellow;
    case "overdue":
      return colors.statusRed;
    default:
      return colors.statusYellow;
  }
}

export function getStatusLabel(status: StatusType): string {
  switch (status) {
    case "good":
      return "GOOD";
    case "due_soon":
      return "DUE SOON";
    case "overdue":
      return "OVERDUE";
    default:
      return "UNKNOWN";
  }
}
