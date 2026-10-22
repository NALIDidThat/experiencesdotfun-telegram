// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

export * from "./experiences";
export * from "./experience-locations";
export * from "./experience-milestones";
export * from "./community";
export * from "./community-moderation";
export * from "./accountability";
export * from "./xp-awards";
export * from "./memory-game";
export * from "./social-invites";
export * from "./social-feed";
export * from "./connections";
export * from "./direct-messages";
export * from "./experience-challenges";
export * from "./ai-assistant";
export * from "./fundraising";
export * from "./organisation-verification";
export * from "./participation-review-events";