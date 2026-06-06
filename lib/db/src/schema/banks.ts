import { pgTable, serial, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const banksTable = pgTable("banks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isDefault: boolean("is_default").notNull().default(false),
});

export const insertBankSchema = createInsertSchema(banksTable).omit({ id: true });
export type InsertBank = z.infer<typeof insertBankSchema>;
export type Bank = typeof banksTable.$inferSelect;
