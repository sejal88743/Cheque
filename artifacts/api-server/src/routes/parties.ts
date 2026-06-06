import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, partiesTable } from "@workspace/db";
import { LookupPartyQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/parties/lookup", async (req, res): Promise<void> => {
  const parsed = LookupPartyQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [party] = await db
    .select()
    .from(partiesTable)
    .where(eq(partiesTable.billNo, parsed.data.billNo));

  if (!party) {
    res.status(404).json({ error: "Party not found for this bill number" });
    return;
  }

  res.json({
    billNo: party.billNo,
    partyName: party.partyName,
    chequeNo: party.chequeNo ?? null,
  });
});

export default router;
