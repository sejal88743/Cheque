import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length === 0) {
    const [created] = await db
      .insert(settingsTable)
      .values({ bankName: "", accountNo: "", mobileNo: "" })
      .returning();
    res.json(created);
    return;
  }
  res.json(rows[0]);
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db.select().from(settingsTable).limit(1);

  if (rows.length === 0) {
    const [created] = await db
      .insert(settingsTable)
      .values({
        bankName: parsed.data.bankName ?? "",
        accountNo: parsed.data.accountNo ?? "",
        mobileNo: parsed.data.mobileNo ?? "",
      })
      .returning();
    res.json(created);
    return;
  }

  const [updated] = await db
    .update(settingsTable)
    .set({
      ...(parsed.data.bankName != null && { bankName: parsed.data.bankName }),
      ...(parsed.data.accountNo != null && { accountNo: parsed.data.accountNo }),
      ...(parsed.data.mobileNo != null && { mobileNo: parsed.data.mobileNo }),
    })
    .returning();

  res.json(updated);
});

export default router;
