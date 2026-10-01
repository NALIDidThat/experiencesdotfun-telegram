import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { feedPreferencesTable } from "@workspace/db/schema";

type FeedTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function automaticActivityVisibility(
  transaction: FeedTransaction,
  userId: number,
): Promise<"friends" | "private"> {
  const [preference] = await transaction
    .select({
      shareActivityWithFriends: feedPreferencesTable.shareActivityWithFriends,
    })
    .from(feedPreferencesTable)
    .where(eq(feedPreferencesTable.userId, userId))
    .for("update")
    .limit(1);

  return preference?.shareActivityWithFriends ? "friends" : "private";
}