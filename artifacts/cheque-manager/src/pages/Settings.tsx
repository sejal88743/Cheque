import { useState, useRef } from "react";
import { format } from "date-fns";
import { batchLookupBillData, updateBillFromImport } from "@/lib/supabase";
import { useGetSettings, useUpdateSettings, useListBanks, useCreateBank, useDeleteBank, getListBanksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trash2, Building, Save, Upload, CheckCircle2, Loader2, FileSpreadsheet, CalendarDays, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { parseXLSForImport, type ParsedImportEntry, type ImportPreview } from "@/lib/xlsImport";

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function normalizeBankName(name: string): string {
  return name.toUpperCase()
    .replace(/\b(BANK|LTD|PVT|CO|URBAN|COOPERATIVE|COOP|GRAMIN|SAHAKARI|NAGARI)\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function isSameBankName(a: string, b: string): boolean {
  const na = normalizeBankName(a);
  const nb = normalizeBankName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const threshold = Math.min(2, Math.floor(Math.max(na.length, nb.length) / 6));
  return levenshtein(na, nb) <= threshold;
}

const settingsSchema = z.object({
  bankName: z.string().min(1, "Required"),
  accountNo: z.string().min(1, "Required"),
  mobileNo: z.string().min(1, "Required"),
});

interface ImportResult {
  saved: number;
  duplicates: number;
  errors: number;
  banksCreated: number;
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();

  const { data: banks, refetch: refetchBanks } = useListBanks({ query: { queryKey: getListBanksQueryKey() } });
  const createBank = useCreateBank();
  const deleteBank = useDeleteBank();

  const [newBankName, setNewBankName] = useState("");

  const [xlsPreview, setXlsPreview] = useState<string[]>([]);
  const [xlsDialogOpen, setXlsDialogOpen] = useState(false);
  const [xlsUploading, setXlsUploading] = useState(false);
  const bankFileRef = useRef<HTMLInputElement>(null);

  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [editableEntries, setEditableEntries] = useState<ParsedImportEntry[]>([]);
  const [splitOverrides, setSplitOverrides] = useState<Record<string, number>>({});
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [previewOutstanding, setPreviewOutstanding] = useState<Map<string, number>>(new Map());
  const [previewBillNetAmts, setPreviewBillNetAmts] = useState<Map<string, number | null>>(new Map());
  const [outstandingLoading, setOutstandingLoading] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(new Set());
  const entryFileRef = useRef<HTMLInputElement>(null);

  const updateEntry = (idx: number, field: keyof ParsedImportEntry, value: string | number) => {
    setEditableEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };
  const getSplitAmt = (ei: number, billNo: string, computed: number) =>
    splitOverrides[`${ei}:${billNo}`] ?? computed;
  const setSplitAmt = (ei: number, billNo: string, val: number) =>
    setSplitOverrides(prev => ({ ...prev, [`${ei}:${billNo}`]: val }));

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { bankName: "", accountNo: "", mobileNo: "" },
    values: settings ? {
      bankName: settings.bankName || "",
      accountNo: settings.accountNo || "",
      mobileNo: settings.mobileNo || "",
    } : undefined,
  });

  const onSettingsSubmit = (values: z.infer<typeof settingsSchema>) => {
    updateSettings.mutate({ data: values }, {
      onSuccess: () => toast({ title: "Settings saved." }),
    });
  };

  const handleAddBank = () => {
    if (!newBankName.trim()) return;
    createBank.mutate({ data: { name: newBankName.trim() } }, {
      onSuccess: () => {
        setNewBankName("");
        toast({ title: "Bank Added" });
        refetchBanks();
      },
    });
  };

  const handleDeleteBank = (id: number) => {
    deleteBank.mutate({ id }, {
      onSuccess: () => { toast({ title: "Bank Deleted" }); refetchBanks(); },
    });
  };

  const handleBankXlsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const names: string[] = [];
      for (const row of rows) {
        for (const cell of row) {
          if (typeof cell === "string" && cell.trim().length > 1 && isNaN(Number(cell))) {
            const cleaned = cell.trim().toUpperCase();
            if (!names.includes(cleaned)) names.push(cleaned);
          }
        }
      }

      if (names.length === 0) {
        toast({ variant: "destructive", title: "No bank names found" });
        return;
      }
      setXlsPreview(names);
      setXlsDialogOpen(true);
    } catch {
      toast({ variant: "destructive", title: "File read error" });
    } finally {
      if (bankFileRef.current) bankFileRef.current.value = "";
    }
  };

  const handleBankXlsConfirm = async () => {
    setXlsUploading(true);
    let added = 0;
    for (const name of xlsPreview) {
      try {
        await new Promise<void>((resolve, reject) => {
          createBank.mutate({ data: { name } }, { onSuccess: () => { added++; resolve(); }, onError: reject });
        });
      } catch {}
    }
    setXlsUploading(false);
    setXlsDialogOpen(false);
    setXlsPreview([]);
    refetchBanks();
    toast({ title: `${added} banks added` });
  };

  const handleEntryXlsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast({ title: "File parsing..." });
      const preview = await parseXLSForImport(file);
      if (preview.entries.length === 0) {
        toast({ variant: "destructive", title: "No entries found", description: "File mein koi valid data nahi mila." });
        return;
      }
      setImportPreview(preview);
      setEditableEntries(preview.entries.map(e => ({ ...e })));
      setSplitOverrides({});
      setImportResult(null);
      setPreviewOutstanding(new Map());
      setPreviewBillNetAmts(new Map());
      // Default: all entries selected
      setSelectedEntries(new Set(preview.entries.map((_, i) => i)));
      setImportDialogOpen(true);
      // Load bill data (outstanding + net amount) from Supabase in background
      const allBillNos = [...new Set(preview.entries.flatMap(e => e.billNos))];
      setOutstandingLoading(true);
      batchLookupBillData(allBillNos)
        .then(({ outstandingMap, billNetMap }) => {
          setPreviewOutstanding(outstandingMap);
          setPreviewBillNetAmts(billNetMap);
        })
        .catch(() => {})
        .finally(() => setOutstandingLoading(false));
    } catch (err) {
      toast({ variant: "destructive", title: "File parse failed", description: String(err) });
    } finally {
      if (entryFileRef.current) entryFileRef.current.value = "";
    }
  };

  const ensureBankExists = async (bankName: string, existingBankNames: Set<string>): Promise<boolean> => {
    const alreadyExists = [...existingBankNames].some(existing => isSameBankName(existing, bankName));
    if (alreadyExists) return false;
    try {
      await new Promise<void>((resolve, reject) => {
        createBank.mutate({ data: { name: bankName } }, { onSuccess: () => resolve(), onError: reject });
      });
      existingBankNames.add(bankName);
      return true;
    } catch {
      existingBankNames.add(bankName);
      return false;
    }
  };

  const splitAmounts = (
    billNos: string[],
    chequeTotal: number,
    outstandingMap: Map<string, number>
  ): { billNo: string; amount: number }[] => {
    if (billNos.length === 1) return [{ billNo: billNos[0], amount: chequeTotal }];
    let rem = chequeTotal;
    return billNos.map((billNo, i) => {
      const isLast = i === billNos.length - 1;
      if (isLast) return { billNo, amount: Math.round(rem * 100) / 100 };
      const outstanding = outstandingMap.get(billNo) ?? 0;
      const amt = Math.round(outstanding * 100) / 100;
      rem -= amt;
      return { billNo, amount: amt };
    });
  };

  const saveSingleBillEntry = async (
    entry: ParsedImportEntry,
    billNo: string,
    amount: number,
    discrepancyAmt: number
  ): Promise<'saved' | 'duplicate' | 'error'> => {
    try {
      const res = await fetch('/api/cheque-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryDate: entry.entryDate,
          chequeDate: entry.chequeDate,
          partyName: entry.partyName,
          billNos: [billNo],
          chequeAmount: amount,
          chequeNo: entry.chequeNo,
          bankName: entry.bankName,
          discrepancyAmt,
        }),
      });
      if (res.status === 409) return 'duplicate';
      if (!res.ok) return 'error';
      return 'saved';
    } catch {
      return 'error';
    }
  };

  const handleImportConfirm = async () => {
    if (!editableEntries.length) return;
    setImporting(true);
    setImportProgress(0);
    setImportResult(null);

    const result: ImportResult = { saved: 0, duplicates: 0, errors: 0, banksCreated: 0 };
    const existingBankNames = new Set<string>((banks ?? []).map((b: { name: string }) => b.name.toUpperCase()));
    const entries = editableEntries;
    const total = entries.length;
    setImportTotal(total);

    // Use already-loaded outstanding map from preview (skip re-fetch)
    const outstandingMap = previewOutstanding;

    for (let i = 0; i < total; i++) {
      const entry = entries[i];

      const created = await ensureBankExists(entry.bankName.toUpperCase(), existingBankNames);
      if (created) result.banksCreated++;

      const computedSplits = splitAmounts(entry.billNos, entry.chequeAmount, outstandingMap);
      // Apply per-bill overrides from inline editing
      const splits = computedSplits.map(s => ({
        billNo: s.billNo,
        amount: getSplitAmt(i, s.billNo, s.amount),
      }));

      const totalOut = entry.billNos.reduce((s, b) => s + (outstandingMap.get(b) ?? 0), 0);
      const discrepancyAmt = Math.round((entry.chequeAmount - totalOut) * 100) / 100;

      for (const split of splits) {
        const status = await saveSingleBillEntry(entry, split.billNo, split.amount, discrepancyAmt);
        if (status === 'saved') result.saved++;
        else if (status === 'duplicate') result.duplicates++;
        else result.errors++;

        // Only update Supabase for selected entries
        if (selectedEntries.has(i)) {
          try {
            await updateBillFromImport(split.billNo, {
              cheque_date: entry.chequeDate,
              bank_name: entry.bankName.toUpperCase(),
              cheque_no: entry.chequeNo,
              payment_date: format(new Date(entry.entryDate), 'dd/MM/yyyy'),
            });
          } catch { /* non-fatal */ }
        }
      }

      setImportProgress(i + 1);
    }

    setImporting(false);
    setImportResult(result);
    refetchBanks();
    queryClient.invalidateQueries({ queryKey: ['/api/cheque-entries'] });

    toast({
      title: `Import Complete`,
      description: `${result.saved} saved, ${result.duplicates} duplicate, ${result.errors} error`,
    });
  };

  const totalImportEntries = importPreview?.entries.length ?? 0;
  const progressPct = importTotal > 0 ? Math.round((importProgress / importTotal) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="shadow-md">
        <CardHeader className="bg-slate-50 border-b pb-4">
          <CardTitle className="text-xl">Report Header</CardTitle>
          <CardDescription>Printed deposit slip par show hoga.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSettingsSubmit)} className="space-y-4">
              <FormField control={form.control} name="bankName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Bank Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="accountNo" render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Number</FormLabel>
                  <FormControl><Input {...field} className="font-mono tracking-widest" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="mobileNo" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mobile Number</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full mt-4" disabled={updateSettings.isPending}>
                <Save className="h-4 w-4 mr-2" /> Save Settings
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader className="bg-slate-50 border-b pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <Building className="h-5 w-5" /> Bank Master
          </CardTitle>
          <CardDescription>Banks ki list — manually ya XLS se add karo.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 flex flex-col h-[420px]">
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Bank name type karo..."
              value={newBankName}
              onChange={e => setNewBankName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddBank()}
              className="flex-1"
            />
            <Button onClick={handleAddBank} disabled={createBank.isPending}>Add</Button>
          </div>

          <div className="mb-4">
            <input ref={bankFileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleBankXlsFile} />
            <Button
              variant="outline"
              className="w-full border-dashed border-2 h-10 text-muted-foreground hover:text-primary hover:border-primary"
              onClick={() => bankFileRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" /> XLS se Banks Upload Karo
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto border rounded-md divide-y">
            {(banks ?? []).map((bank: { id: number; name: string; isDefault: boolean }) => (
              <div key={bank.id} className="flex justify-between items-center p-3 text-sm hover:bg-slate-50">
                <span className="font-medium">{bank.name}</span>
                {!bank.isDefault ? (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteBank(bank.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">System</span>
                )}
              </div>
            ))}
            {(banks ?? []).length === 0 && (
              <div className="p-8 text-center text-muted-foreground">No banks found.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-md md:col-span-2">
        <CardHeader className="bg-blue-50 border-b pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Cheque Entries Bulk Import
          </CardTitle>
          <CardDescription>
            Bank Slip XLS upload karo — har sheet ka naam cheque date hai (jaise "1JUN", "23 JUNE").
            Automatic bank creation, bill-wise save, aur duplicate skip hoga.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <input ref={entryFileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleEntryXlsFile} />
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
              onClick={() => entryFileRef.current?.click()}
            >
              <Upload className="h-5 w-5 mr-2" />
              Bank Slip XLS Upload Karo
            </Button>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>✅ Sheet name = Cheque date (1JUN, 5JUNE, 23 JUNE, 27 …)</p>
              <p>✅ Multiple bill nos → automatically parse hoga (+, - separator)</p>
              <p>✅ Bank missing → auto create hoga</p>
              <p>✅ Duplicate entry → skip kiya jayega</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={xlsDialogOpen} onOpenChange={setXlsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>XLS se {xlsPreview.length} Banks Found</DialogTitle>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto border rounded-md divide-y text-sm">
            {xlsPreview.map((name, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>{name}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setXlsDialogOpen(false); setXlsPreview([]); }}>Cancel</Button>
            <Button onClick={handleBankXlsConfirm} disabled={xlsUploading}>
              {xlsUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sab Add Karo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={open => { if (!importing) setImportDialogOpen(open); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              Import Preview — {totalImportEntries} Entries
            </DialogTitle>
            <DialogDescription>
              Niche sheets ka breakdown dekho, phir Import karo.
            </DialogDescription>
          </DialogHeader>

          {!importResult && !importing && importPreview && editableEntries.length > 0 && (
            <div className="space-y-3">
              {/* Summary chips */}
              <div className="flex flex-wrap gap-2 text-xs items-center">
                <span className="bg-blue-50 border border-blue-200 rounded px-2 py-1 text-blue-800 font-medium">
                  📄 {importPreview.sheetSummary.map(s => s.name).join(", ")}
                </span>
                <span className="bg-slate-50 border rounded px-2 py-1 text-slate-700">
                  {totalImportEntries} entries · {[...new Set(editableEntries.flatMap(e => e.billNos))].length} bills
                </span>
                <span className="bg-green-50 border border-green-200 rounded px-2 py-1 text-green-800 font-medium">
                  ✅ {selectedEntries.size} selected (Supabase update hoga)
                </span>
                {outstandingLoading && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Outstanding load ho raha hai...
                  </span>
                )}
                <span className="text-muted-foreground italic">✏️ Cells edit ho sakte hain — click karke change karo</span>
              </div>

              {/* Editable entries table — compact */}
              <div className="border rounded-md overflow-hidden">
                <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-slate-100 sticky top-0 z-10">
                      <tr>
                        <th className="px-2 py-1.5 border-b w-8">
                          <input
                            type="checkbox"
                            checked={selectedEntries.size === editableEntries.length}
                            onChange={e => setSelectedEntries(e.target.checked ? new Set(editableEntries.map((_, i) => i)) : new Set())}
                            className="cursor-pointer"
                            title="Sab select / deselect"
                          />
                        </th>
                        <th className="text-left px-2 py-1.5 font-semibold text-slate-700 border-b">Bill No</th>
                        <th className="text-left px-1 py-1.5 font-semibold text-blue-700 border-b">✏ Bank Name</th>
                        <th className="text-left px-1 py-1.5 font-semibold text-blue-700 border-b">✏ Cheq No</th>
                        <th className="text-left px-1 py-1.5 font-semibold text-blue-700 border-b">✏ Cheq Date</th>
                        <th className="text-right px-2 py-1.5 font-semibold text-slate-600 border-b">Net Amt</th>
                        <th className="text-right px-2 py-1.5 font-semibold text-red-700 border-b">Outstanding</th>
                        <th className="text-right px-1 py-1.5 font-semibold text-green-700 border-b">✏ Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editableEntries.map((entry, ei) => {
                        const computedSplits = splitAmounts(entry.billNos, entry.chequeAmount, previewOutstanding);
                        return computedSplits.map((split, bi) => {
                          const outstanding = previewOutstanding.get(split.billNo);
                          const billNetAmt = previewBillNetAmts.get(split.billNo);
                          const isFirstBill = bi === 0;
                          const isMulti = computedSplits.length > 1;
                          const paidAmt = getSplitAmt(ei, split.billNo, split.amount);
                          return (
                            <tr key={`${ei}-${bi}`} className={`border-b ${!selectedEntries.has(ei) ? "opacity-40" : ""} ${isMulti && !isFirstBill ? "bg-amber-50/40" : "hover:bg-slate-50/80"}`}>
                              {/* Checkbox — only on first bill row */}
                              <td className="px-2 py-1 align-middle text-center">
                                {isFirstBill && (
                                  <input
                                    type="checkbox"
                                    checked={selectedEntries.has(ei)}
                                    onChange={() => setSelectedEntries(prev => {
                                      const next = new Set(prev);
                                      if (next.has(ei)) next.delete(ei); else next.add(ei);
                                      return next;
                                    })}
                                    className="cursor-pointer"
                                  />
                                )}
                              </td>
                              {/* Bill No */}
                              <td className="px-2 py-1 font-mono font-bold text-slate-800 align-middle whitespace-nowrap">
                                {split.billNo}
                                {isMulti && <span className="ml-1 text-[10px] text-amber-600 font-normal">(m)</span>}
                              </td>
                              {/* Bank Name — editable, shared across multi-bill */}
                              <td className="px-1 py-1 align-middle">
                                {isFirstBill ? (
                                  <input
                                    type="text"
                                    value={entry.bankName}
                                    onChange={e => updateEntry(ei, "bankName", e.target.value.toUpperCase())}
                                    className="w-full min-w-[90px] bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 text-xs font-medium text-blue-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                                  />
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic px-1">↑</span>
                                )}
                              </td>
                              {/* Cheque No — editable, shared */}
                              <td className="px-1 py-1 align-middle">
                                {isFirstBill ? (
                                  <input
                                    type="text"
                                    value={entry.chequeNo}
                                    onChange={e => updateEntry(ei, "chequeNo", e.target.value)}
                                    className="w-full min-w-[60px] bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 text-xs font-mono text-blue-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                                  />
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic px-1">↑</span>
                                )}
                              </td>
                              {/* Cheque Date — editable, shared */}
                              <td className="px-1 py-1 align-middle">
                                {isFirstBill ? (
                                  <input
                                    type="date"
                                    value={entry.chequeDate}
                                    onChange={e => updateEntry(ei, "chequeDate", e.target.value)}
                                    className="w-full min-w-[110px] bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 text-xs text-blue-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                                  />
                                ) : ""}
                              </td>
                              {/* Bill Net Amt — from Supabase, read-only */}
                              <td className="px-2 py-1 text-right font-mono align-middle text-slate-600">
                                {outstandingLoading ? (
                                  <span className="text-muted-foreground">…</span>
                                ) : billNetAmt != null ? (
                                  <span>₹{billNetAmt.toLocaleString("en-IN")}</span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              {/* Outstanding — from Supabase, read-only */}
                              <td className="px-2 py-1 text-right font-mono align-middle">
                                {outstandingLoading ? (
                                  <span className="text-muted-foreground">…</span>
                                ) : outstanding != null ? (
                                  <span className={outstanding > 0 ? "text-red-700 font-semibold" : "text-green-600 font-semibold"}>
                                    {outstanding > 0 ? `₹${outstanding.toLocaleString("en-IN")}` : "✓"}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              {/* Paid amount — per-bill editable */}
                              <td className="px-1 py-1 align-middle">
                                <input
                                  type="number"
                                  value={paidAmt}
                                  onChange={e => setSplitAmt(ei, split.billNo, Number(e.target.value))}
                                  className="w-full min-w-[70px] bg-green-50 border border-green-200 rounded px-1.5 py-0.5 text-xs font-mono text-right text-green-900 font-semibold focus:outline-none focus:border-green-500 focus:bg-white"
                                />
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                    <tfoot className="bg-slate-100 border-t-2 border-slate-300 sticky bottom-0">
                      <tr>
                        <td colSpan={6} className="px-2 py-1.5 text-right text-xs font-bold text-slate-600">Total</td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-red-700">
                          ₹{editableEntries.reduce((s, e) => s + (previewOutstanding.get(e.billNos[0]) ?? 0), 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-green-700">
                          ₹{editableEntries.reduce((s, e, ei) => {
                            const sp = splitAmounts(e.billNos, e.chequeAmount, previewOutstanding);
                            return s + sp.reduce((ss, spl) => ss + getSplitAmt(ei, spl.billNo, spl.amount), 0);
                          }, 0).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Banks status */}
              {importPreview.banksFound.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5 text-slate-600">Banks in file ({importPreview.banksFound.length}):</p>
                  <div className="flex flex-wrap gap-1">
                    {importPreview.banksFound.map((b, i) => {
                      const exists = (banks ?? []).some((bank: { name: string }) => bank.name.toUpperCase() === b);
                      return (
                        <Badge key={i} variant={exists ? "outline" : "default"} className={exists ? "text-xs" : "text-xs bg-orange-100 text-orange-700 border-orange-300"}>
                          {exists ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertCircle className="h-3 w-3 mr-1" />}
                          {b}
                        </Badge>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    🟠 Orange = nayi bank (auto-create hogi) · ✅ Green = already hai
                  </p>
                </div>
              )}
            </div>
          )}

          {importing && (
            <div className="space-y-3 py-4">
              <div className="flex justify-between text-sm font-medium">
                <span>Importing...</span>
                <span>{importProgress} / {importTotal}</span>
              </div>
              <Progress value={progressPct} className="h-3" />
              <p className="text-xs text-muted-foreground text-center">Kripya wait karo, app band mat karo.</p>
            </div>
          )}

          {importResult && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{importResult.saved}</p>
                  <p className="text-xs text-green-600">Saved</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{importResult.duplicates}</p>
                  <p className="text-xs text-yellow-600">Duplicates Skipped</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{importResult.errors}</p>
                  <p className="text-xs text-red-600">Errors</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{importResult.banksCreated}</p>
                  <p className="text-xs text-blue-600">Banks Created</p>
                </div>
              </div>
              <p className="text-sm text-center text-muted-foreground">
                Import complete! Reports page par naye entries dekh sakte ho.
              </p>
            </div>
          )}

          <DialogFooter>
            {!importing && !importResult && (
              <>
                <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleImportConfirm} className="bg-blue-600 hover:bg-blue-700">
                  <Upload className="h-4 w-4 mr-2" />
                  Import Karo ({totalImportEntries} entries)
                </Button>
              </>
            )}
            {importResult && (
              <Button onClick={() => setImportDialogOpen(false)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
