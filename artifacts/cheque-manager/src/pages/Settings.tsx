import { useState, useRef } from "react";
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
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const entryFileRef = useRef<HTMLInputElement>(null);

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
      setImportResult(null);
      setImportDialogOpen(true);
    } catch (err) {
      toast({ variant: "destructive", title: "File parse failed", description: String(err) });
    } finally {
      if (entryFileRef.current) entryFileRef.current.value = "";
    }
  };

  const ensureBankExists = async (bankName: string, existingBankNames: Set<string>): Promise<boolean> => {
    if (existingBankNames.has(bankName)) return false;
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

  const saveEntry = async (entry: ParsedImportEntry): Promise<'saved' | 'duplicate' | 'error'> => {
    try {
      const res = await fetch('/api/cheque-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryDate: entry.entryDate,
          chequeDate: entry.chequeDate,
          partyName: entry.partyName,
          billNos: entry.billNos,
          chequeAmount: entry.chequeAmount,
          chequeNo: entry.chequeNo,
          bankName: entry.bankName,
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
    if (!importPreview) return;
    setImporting(true);
    setImportProgress(0);
    setImportResult(null);

    const result: ImportResult = { saved: 0, duplicates: 0, errors: 0, banksCreated: 0 };
    const existingBankNames = new Set<string>((banks ?? []).map((b: { name: string }) => b.name.toUpperCase()));
    const total = importPreview.entries.length;
    setImportTotal(total);

    for (let i = 0; i < total; i++) {
      const entry = importPreview.entries[i];

      const created = await ensureBankExists(entry.bankName, existingBankNames);
      if (created) result.banksCreated++;

      const status = await saveEntry(entry);
      if (status === 'saved') result.saved++;
      else if (status === 'duplicate') result.duplicates++;
      else result.errors++;

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

          {!importResult && !importing && importPreview && (
            <div className="space-y-4">
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-2 font-semibold">Sheet</th>
                      <th className="text-left p-2 font-semibold">Cheque Date</th>
                      <th className="text-right p-2 font-semibold">Entries</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {importPreview.sheetSummary.map((s, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 font-mono text-xs">{s.name}</td>
                        <td className="p-2 flex items-center gap-1">
                          <CalendarDays className="h-3 w-3 text-muted-foreground" />
                          {s.date || <span className="text-destructive text-xs">Date detect nahi hui</span>}
                        </td>
                        <td className="p-2 text-right">
                          <Badge variant="secondary">{s.count}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importPreview.banksFound.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Banks found in file ({importPreview.banksFound.length}):</p>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {importPreview.banksFound.map((b, i) => {
                      const exists = (banks ?? []).some((bank: { name: string }) => bank.name.toUpperCase() === b);
                      return (
                        <Badge key={i} variant={exists ? "outline" : "default"} className={exists ? "" : "bg-orange-100 text-orange-700 border-orange-300"}>
                          {exists ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertCircle className="h-3 w-3 mr-1" />}
                          {b}
                        </Badge>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Orange = new bank (auto-create hoga) · Green = already exists
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
