import { pgTable, serial, text, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chequeEntriesTable = pgTable("cheque_entries", {
  id: serial("id").primaryKey(),
  entryDate: date("entry_date", { mode: "string" }).notNull(),
  chequeDate: date("cheque_date", { mode: "string" }).notNull(),
  billNos: text("bill_nos").array().notNull(),
  partyName: text("party_name").notNull(),
  chequeAmount: numeric("cheque_amount", { precision: 12, scale: 2 }).notNull(),
  chequeNo: text("cheque_no").notNull(),
  bankName: text("bank_name").notNull(),
  discrepancyAmt: numeric("discrepancy_amt", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const insertChequeEntrySchema = createInsertSchema(chequeEntriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertChequeEntry = z.infer<typeof insertChequeEntrySchema>;
export type ChequeEntry = typeof chequeEntriesTable.$inferSelect;
