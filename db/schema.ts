import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/* One authoritative snapshot per authenticated ChatGPT account. The browser keeps
   the same shape as an offline cache, which makes first sync and recovery simple. */
export const accountData = sqliteTable("account_data", {
  userId: text("user_id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
