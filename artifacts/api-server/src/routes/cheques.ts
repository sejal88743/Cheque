import { Router, type IRouter } from "express";
import { and, between, eq, ilike, sql } from "drizzle-orm";
import { db, chequeEntriesTable } from "@workspace/db";
import {
  ListChequeEntriesQueryParams,
  CreateChequeEntryBody,
  GetChequeEntryParams,
  UpdateChequeEntryParams,
  UpdateChequeEntryBody,
  DeleteChequeEntryParams,
  GetChequeStatsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/cheque-entries", async (req, res): Promise<void> => {
  const parsed = ListChequeEntriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { entryDateFrom, entryDateTo, chequeDateFrom, chequeDateTo, billNo, chequeNo, partyName, bankName } = parsed.data;

  const conditions = [];

  if (entryDateFrom && entryDateTo) {
    conditions.push(between(chequeEntriesTable.entryDate, entryDateFrom, entryDateTo));
  } else if (entryDateFrom) {
    conditions.push(sql`${chequeEntriesTable.entryDate} >= ${entryDateFrom}`);
  } else if (entryDateTo) {
    conditions.push(sql`${chequeEntriesTable.entryDate} <= ${entryDateTo}`);
  }

  if (chequeDateFrom && chequeDateTo) {
    conditions.push(between(chequeEntriesTable.chequeDate, chequeDateFrom, chequeDateTo));
  } else if (chequeDateFrom) {
    conditions.push(sql`${chequeEntriesTable.chequeDate} >= ${chequeDateFrom}`);
  } else if (chequeDateTo) {
    conditions.push(sql`${chequeEntriesTable.chequeDate} <= ${chequeDateTo}`);
  }

  if (billNo) {
    conditions.push(sql`${chequeEntriesTable.billNos} && ARRAY[${billNo}]::text[]`);
  }

  if (chequeNo) {
    conditions.push(ilike(chequeEntriesTable.chequeNo, `%${chequeNo}%`));
  }

  if (partyName) {
    conditions.push(ilike(chequeEntriesTable.partyName, `%${partyName}%`));
  }

  if (bankName) {
    conditions.push(ilike(chequeEntriesTable.bankName, `%${bankName}%`));
  }

  const entries = await db
    .select()
    .from(chequeEntriesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${chequeEntriesTable.createdAt} DESC`);

  const result = entries.map((e) => ({
    ...e,
    chequeAmount: parseFloat(e.chequeAmount),
    updatedAt: e.updatedAt ? e.updatedAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
  }));

  res.json(result);
});

router.post("/cheque-entries", async (req, res): Promise<void> => {
  const parsed = CreateChequeEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { chequeDate, chequeAmount, chequeNo, partyName } = parsed.data;

  const existing = await db
    .select()
    .from(chequeEntriesTable)
    .where(
      and(
        eq(chequeEntriesTable.chequeDate, chequeDate),
        eq(chequeEntriesTable.chequeNo, chequeNo),
        ilike(chequeEntriesTable.partyName, partyName),
        sql`${chequeEntriesTable.chequeAmount} = ${chequeAmount}`
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const dup = existing[0];
    res.status(409).json({
      warning: "Possible Duplicate Cheque Entry",
      duplicate: {
        ...dup,
        chequeAmount: parseFloat(dup.chequeAmount),
        updatedAt: dup.updatedAt ? dup.updatedAt.toISOString() : null,
        createdAt: dup.createdAt.toISOString(),
      },
    });
    return;
  }

  const [entry] = await db
    .insert(chequeEntriesTable)
    .values({
      ...parsed.data,
      chequeAmount: String(parsed.data.chequeAmount),
    })
    .returning();

  res.status(201).json({
    ...entry,
    chequeAmount: parseFloat(entry.chequeAmount),
    updatedAt: entry.updatedAt ? entry.updatedAt.toISOString() : null,
    createdAt: entry.createdAt.toISOString(),
  });
});

router.get("/cheque-entries/stats", async (req, res): Promise<void> => {
  const parsed = GetChequeStatsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { entryDateFrom, entryDateTo, chequeDateFrom, chequeDateTo } = parsed.data;

  const conditions = [];

  if (entryDateFrom && entryDateTo) {
    conditions.push(between(chequeEntriesTable.entryDate, entryDateFrom, entryDateTo));
  } else if (entryDateFrom) {
    conditions.push(sql`${chequeEntriesTable.entryDate} >= ${entryDateFrom}`);
  } else if (entryDateTo) {
    conditions.push(sql`${chequeEntriesTable.entryDate} <= ${entryDateTo}`);
  }

  if (chequeDateFrom && chequeDateTo) {
    conditions.push(between(chequeEntriesTable.chequeDate, chequeDateFrom, chequeDateTo));
  } else if (chequeDateFrom) {
    conditions.push(sql`${chequeEntriesTable.chequeDate} >= ${chequeDateFrom}`);
  } else if (chequeDateTo) {
    conditions.push(sql`${chequeEntriesTable.chequeDate} <= ${chequeDateTo}`);
  }

  const [stats] = await db
    .select({
      totalCheques: sql<number>`count(*)::int`,
      totalAmount: sql<number>`coalesce(sum(${chequeEntriesTable.chequeAmount}::numeric), 0)::float`,
    })
    .from(chequeEntriesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json({
    totalCheques: stats?.totalCheques ?? 0,
    totalAmount: stats?.totalAmount ?? 0,
  });
});

router.get("/cheque-entries/:id", async (req, res): Promise<void> => {
  const params = GetChequeEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [entry] = await db
    .select()
    .from(chequeEntriesTable)
    .where(eq(chequeEntriesTable.id, params.data.id));

  if (!entry) {
    res.status(404).json({ error: "Cheque entry not found" });
    return;
  }

  res.json({
    ...entry,
    chequeAmount: parseFloat(entry.chequeAmount),
    updatedAt: entry.updatedAt ? entry.updatedAt.toISOString() : null,
    createdAt: entry.createdAt.toISOString(),
  });
});

router.put("/cheque-entries/:id", async (req, res): Promise<void> => {
  const params = UpdateChequeEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateChequeEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.chequeAmount != null) {
    updateData.chequeAmount = String(parsed.data.chequeAmount);
  }
  updateData.updatedAt = new Date();

  const [entry] = await db
    .update(chequeEntriesTable)
    .set(updateData)
    .where(eq(chequeEntriesTable.id, params.data.id))
    .returning();

  if (!entry) {
    res.status(404).json({ error: "Cheque entry not found" });
    return;
  }

  res.json({
    ...entry,
    chequeAmount: parseFloat(entry.chequeAmount),
    updatedAt: entry.updatedAt ? entry.updatedAt.toISOString() : null,
    createdAt: entry.createdAt.toISOString(),
  });
});

router.delete("/cheque-entries/:id", async (req, res): Promise<void> => {
  const params = DeleteChequeEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [entry] = await db
    .delete(chequeEntriesTable)
    .where(eq(chequeEntriesTable.id, params.data.id))
    .returning();

  if (!entry) {
    res.status(404).json({ error: "Cheque entry not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
