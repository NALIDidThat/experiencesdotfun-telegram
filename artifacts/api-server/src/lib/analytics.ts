import { lt } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  analyticsEventsTable,
  type AnalyticsEventCategory,
  type AnalyticsEventName,
  type AnalyticsPlatform,
} from "@workspace/db/schema";
import { logger } from "./logger";

export type AnalyticsEventInput = {
  source: "app" | "bot" | "server";
  eventName: AnalyticsEventName;
  category: AnalyticsEventCategory;
  platform: AnalyticsPlatform;
  outcome?: "success" | "failure";
};

export async function recordAnalyticsEvent(event: AnalyticsEventInput): Promise<void> {
  try {
    await db.insert(analyticsEventsTable).values({
      source: event.source,
      eventName: event.eventName,
      category: event.category,
      platform: event.platform,
      outcome: event.outcome ?? null,
    });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "unknown";
    logger.warn({ code }, "Analytics event was not stored.");
  }
}

async function pruneExpiredAnalyticsEvents(): Promise<void> {
  try {
    await db
      .delete(analyticsEventsTable)
      .where(lt(analyticsEventsTable.expiresAt, new Date()));
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "unknown";
    logger.warn({ code }, "Expired analytics events could not be removed.");
  }
}

export function startAnalyticsRetentionCleanup(): void {
  void pruneExpiredAnalyticsEvents();
  const timer = setInterval(() => void pruneExpiredAnalyticsEvents(), 24 * 60 * 60 * 1000);
  timer.unref();
}