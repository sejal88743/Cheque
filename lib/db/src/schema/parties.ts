import { pgTable, text } from "drizzle-orm/pg-core";

export const partiesTable = pgTable("parties", {
  billNo: text("bill_no").primaryKey(),
  partyName: text("party_name").notNull(),
  chequeNo: text("cheque_no"),
});

export type Party = typeof partiesTable.$inferSelect;
