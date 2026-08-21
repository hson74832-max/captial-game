import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const gameSaves = pgTable("game_saves", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  state: jsonb("state").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
