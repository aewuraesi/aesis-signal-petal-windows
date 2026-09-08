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

/* A read-only snapshot of chosen tasks, published behind an unguessable link.

   Deliberately a COPY rather than a live view of `account_data`: a link handed to
   someone should show what was shared at the moment it was shared, and must not
   quietly start showing work logged afterwards. It also means revoking is a delete,
   and nothing about the writer's own data can be reached through this table.

   The diary never reaches here. Nothing personal does either - `app/share.ts` owns
   that rule, and it strips rather than trusting the caller. */
export const shares = sqliteTable("shares", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  /* Null means it stands until it is revoked by hand. */
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
});
