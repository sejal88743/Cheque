import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, banksTable } from "@workspace/db";
import { CreateBankBody, DeleteBankParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/banks", async (_req, res): Promise<void> => {
  const banks = await db.select().from(banksTable).orderBy(banksTable.name);
  res.json(banks);
});

router.post("/banks", async (req, res): Promise<void> => {
  const parsed = CreateBankBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [bank] = await db
    .insert(banksTable)
    .values({ name: parsed.data.name.toUpperCase(), isDefault: false })
    .returning();

  res.status(201).json(bank);
});

router.delete("/banks/:id", async (req, res): Promise<void> => {
  const params = DeleteBankParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [bank] = await db
    .delete(banksTable)
    .where(eq(banksTable.id, params.data.id))
    .returning();

  if (!bank) {
    res.status(404).json({ error: "Bank not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
