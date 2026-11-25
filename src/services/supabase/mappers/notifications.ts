import type {
  DbNotificationPreferenceRow,
  DbNotificationRow,
} from "@/services/supabase/dbTypes";
import {
  normalizeNotificationCategory,
  type DbNotificationCategory,
} from "@/services/supabase/enums";
import {
  assertBoolean,
  assertIsoTimestamp,
  assertNonEmptyString,
  assertPlainRecord,
  collectWarnings,
  readNullableIsoTimestamp,
  readOptionalJsonObject,
} from "@/services/supabase/mappers/shared";
import type { UserNotificationItem } from "@/types/domain";

/**
 * SILVER SPOON — Notifications & Notification Preferences Mappers (Phase 6.3)
 *
 * Maps `public.notifications` and `public.notification_preferences` (Migration 0009).
 */

export interface MappedNotification {
  readonly notification: UserNotificationItem;
  readonly dbMeta: {
    readonly dbCategory: DbNotificationCategory | null;
    readonly rawCategory: string;
    readonly isRead: boolean;
    readonly readAt: string | null;
    readonly metadata: Record<string, unknown>;
  };
  readonly warnings: readonly string[];
}

export interface MappedNotificationPreferences {
  readonly userId: string;
  readonly emailEnabled: boolean;
  readonly inAppEnabled: boolean;
  readonly securityAlertsEnabled: boolean;
  readonly marketingOptIn: boolean;
  readonly updatedAt: string;
}

export function mapNotificationRow(
  rawRow: DbNotificationRow | unknown,
): MappedNotification {
  const row = assertPlainRecord(rawRow, "notifications");

  const id = assertNonEmptyString(row, "id", "notifications");
  const userId = assertNonEmptyString(row, "user_id", "notifications");
  const rawCategory = assertNonEmptyString(row, "category", "notifications");
  const title = assertNonEmptyString(row, "title", "notifications");
  const body = assertNonEmptyString(row, "body", "notifications");
  const isRead = assertBoolean(row, "is_read", "notifications");
  const readAt = readNullableIsoTimestamp(row, "read_at", "notifications");
  const metadata = readOptionalJsonObject(row, "metadata", "notifications");
  const createdAt = assertIsoTimestamp(row, "created_at", "notifications");

  const categoryNorm = normalizeNotificationCategory(rawCategory);

  const notification: UserNotificationItem = {
    id,
    userId,
    title,
    message: body,
    category: categoryNorm.value,
    createdAt,
    readByUserIds: isRead ? [userId] : [],
    read: isRead,
  };

  return {
    notification,
    dbMeta: {
      dbCategory: categoryNorm.dbValue,
      rawCategory: categoryNorm.raw,
      isRead,
      readAt,
      metadata,
    },
    warnings: collectWarnings(categoryNorm.warning),
  };
}

export function mapNotificationPreferenceRow(
  rawRow: DbNotificationPreferenceRow | unknown,
): MappedNotificationPreferences {
  const row = assertPlainRecord(rawRow, "notification_preferences");

  return {
    userId: assertNonEmptyString(row, "user_id", "notification_preferences"),
    emailEnabled: assertBoolean(row, "email_enabled", "notification_preferences"),
    inAppEnabled: assertBoolean(row, "in_app_enabled", "notification_preferences"),
    securityAlertsEnabled: assertBoolean(
      row,
      "security_alerts_enabled",
      "notification_preferences",
    ),
    marketingOptIn: assertBoolean(row, "marketing_opt_in", "notification_preferences"),
    updatedAt: assertIsoTimestamp(row, "updated_at", "notification_preferences"),
  };
}
