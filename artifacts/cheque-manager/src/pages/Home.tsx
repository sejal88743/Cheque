import { useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, AlertTriangle, IndianRupee, Receipt, X } from "lucide-react";
import { useCreateChequeEntry, useListBanks, getListBanksQueryKey } from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { lookupBillFromSupabase, lookupLinkedBillsByChequNo, updateBillInSupabase, SupaBill } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";

interface BillItem {
  billNo: string;
  partyName: string;
  amount: number;
  outstanding: number;
}

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function Home() {
  const { toast } = useToast();
  const { data: banks } = useListBanks({ query: { queryKey: getListBanksQueryKey() } });
  const createEntry = useCreateChequeEntry();

  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [chequeDay, setChequeDay] = useState(format(new Date(), "dd"));
  const [billNo, setBillNo] = useState("");
  const [partyName, setPartyName] = useState("");
  const [chequeAmount, setChequeAmount] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [bankName, setBankName] = useState("");

  const [lookupLoading, setLookupLoading] = useState(false);
  const [billSource, setBillSource] = useState<"supabase" | "localdb" | null>(null);
  const [billNetAmt, setBillNetAmt] = useState<number | null>(null);
  const [supaBillNo, setSupaBillNo] = useState<string | null>(null);

  const [duplicateWarning, setDuplicateWarning] = useState<{ open: boolean; saveData: any }>({ open: false, saveData: null });

  const [multiBillOpen, setMultiBillOpen] = useState(false);
  const [multiBills, setMultiBills] = useState<BillItem[]>([]);
  const [chequeTotal, setChequeTotal] = useState(0);
  const [nextBillInput, setNextBillInput] = useState("");
  const [nextBillLoading, setNextBillLoading] = useState(false);

  const entryDateRef = useRef<HTMLInputElement>(null);
  const chequeDayRef = useRef<HTMLInputElement>(null);
  const billNoRef = useRef<HTMLInputElement>(null);
  const partyRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const chequeNoRef = useRef<HTMLInputElement>(null);
  const bankRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const nextBillRef = useRef<HTMLInputElement>(null);

  const focusNext = (ref: React.RefObject<HTMLElement | null>) => {
    setTimeout(() => ref.current?.focus(), 50);
  };

  const nav = (e: React.KeyboardEvent, next?: React.RefObject<HTMLElement | null>, prev?: React.RefObject<HTMLElement | null>) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      if (next) focusNext(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (prev) focusNext(prev);
    }
  };

  const resetForm = () => {
    setBillNo("");
    setPartyName("");
    setChequeAmount("");
    setChequeNo("");
    setBankName("");
    setBillSource(null);
    setBillNetAmt(null);
    setSupaBillNo(null);
    setMultiBills([]);
    setChequeTotal(0);
    setNextBillInput("");
    setTimeout(() => billNoRef.current?.focus(), 100);
  };

  const parseChequeDateDay = (dateStr: string): string => {
    try {
      // Handle dd/MM/yyyy format from Supabase
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [dd] = dateStr.split("/");
        return dd;
      }
      // Handle ISO format yyyy-MM-dd
      return format(new Date(dateStr), "dd");
    } catch {
      return "";
    }
  };

  const applySupabaseBill = (data: SupaBill) => {
    if (data.party_name) setPartyName(data.party_name);
    if (data.cheque_no) setChequeNo(data.cheque_no);
    if (data.bank_name) setBankName(data.bank_name);
    // Use outstanding_amount as fallback when cheque_amount is not yet set
    const amt = data.cheque_amount || data.outstanding_amount || data.bill_net_amt;
    if (amt) setChequeAmount(String(amt));
    if (data.bill_net_amt != null) setBillNetAmt(Number(data.bill_net_amt));
    if (data.cheque_date) {
      const day = parseChequeDateDay(data.cheque_date);
      if (day) setChequeDay(day);
    }
  };

  const checkLocalDB = async (bill: string): Promise<any | null> => {
    try {
      const res = await fetch(`/api/cheque-entries?billNo=${encodeURIComponent(bill)}`);
      if (!res.ok) return null;
      const list = await res.json();
      return list?.[0] ?? null;
    } catch {
      return null;
    }
  };

  const loadLinkedLocalBills = async (chequeNo: string, bankName: string): Promise<BillItem[] | null> => {
    try {
      const res = await fetch(`/api/cheque-entries?chequeNo=${encodeURIComponent(chequeNo)}`);
      if (!res.ok) return null;
      const list: any[] = await res.json();
      if (list.length <= 1) return null;
      const filtered = list.filter(e => e.bankName?.toUpperCase() === bankName.toUpperCase());
      if (filtered.length <= 1) return null;
      return filtered.map(e => ({
        billNo: e.billNos?.[0] ?? "",
        partyName: e.partyName ?? "",
        amount: Number(e.chequeAmount ?? 0),
        outstanding: Number(e.chequeAmount ?? 0),
      }));
    } catch {
      return null;
    }
  };

  const performLookup = useCallback(async (input: string) => {
    if (!input.trim()) return;
    setLookupLoading(true);
    setBillSource(null);
    try {
      const local = await checkLocalDB(input.trim());
      if (local) {
        setBillSource("localdb");
        setPartyName(local.partyName ?? "");
        setChequeNo(local.chequeNo ?? "");
        setBankName(local.bankName ?? "");
        if (local.chequeDate) {
          try { setChequeDay(format(new Date(local.chequeDate), "dd")); } catch {}
        }

        // Check for linked bills in local DB via same cheque_no
        if (local.chequeNo && local.bankName) {
          const linkedLocal = await loadLinkedLocalBills(local.chequeNo, local.bankName);
          if (linkedLocal && linkedLocal.length > 1) {
            const total = linkedLocal.reduce((s, b) => s + b.amount, 0);
            setChequeAmount(String(total));
            setMultiBills(linkedLocal);
            setChequeTotal(total);
            setNextBillInput("");
            setMultiBillOpen(true);
            return;
          }
        }
        setChequeAmount(String(local.chequeAmount ?? ""));
        focusNext(partyRef);
        return;
      }

      const data = await lookupBillFromSupabase(input.trim());
      if (!data) {
        focusNext(partyRef);
        return;
      }
      setBillSource("supabase");
      setSupaBillNo(data.bill_no ?? input.trim());
      applySupabaseBill(data);

      const outstanding = Number(data.outstanding_amount ?? data.bill_net_amt ?? 0);
      const chqAmt = Number(data.cheque_amount ?? 0);

      // Already paid via cheque — load all linked bills from Supabase
      if (data.cheque_no && data.bank_name) {
        const linked = await lookupLinkedBillsByChequNo(data.cheque_no, data.bank_name);
        if (linked.length > 1) {
          const totalChq = linked.reduce((s, b) => s + (b.cheque_amount ?? 0), 0);
          const bills: BillItem[] = linked.map(b => ({
            billNo: b.bill_no ?? "",
            partyName: b.party_name ?? "",
            amount: b.cheque_amount ?? b.outstanding_amount ?? 0,
            outstanding: b.outstanding_amount ?? 0,
          }));
          // Set total on amount field and multi-bill state
          setChequeAmount(String(totalChq || chqAmt));
          setMultiBills(bills);
          setChequeTotal(totalChq || chqAmt);
          setNextBillInput("");
          setMultiBillOpen(true);
          return;
        }
      }

      // Fresh single bill — cheque_amount > outstanding means multi-bill cheque
      if (chqAmt > 0 && outstanding > 0 && chqAmt > outstanding) {
        const firstBill: BillItem = {
          billNo: data.bill_no ?? input.trim(),
          partyName: data.party_name ?? "",
          amount: outstanding,
          outstanding,
        };
        setMultiBills([firstBill]);
        setChequeTotal(chqAmt);
        setNextBillInput("");
        setMultiBillOpen(true);
      } else {
        focusNext(partyRef);
      }
    } catch (err) {
      focusNext(partyRef);
    } finally {
      setLookupLoading(false);
    }
  }, []);

  const handleBillNoKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      performLookup(billNo);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusNext(partyRef);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusNext(chequeDayRef);
    }
  };

  const addNextBill = async () => {
    const inp = nextBillInput.trim();
    if (!inp) return;
    setNextBillLoading(true);
    try {
      const data = await lookupBillFromSupabase(inp);
      if (!data) {
        toast({ variant: "destructive", title: "Bill not found", description: `No bill found for "${inp}"` });
        return;
      }
      const outstandingAmt = Number(data.outstanding_amount ?? data.bill_net_amt ?? 0);
      const currentTotal = multiBills.reduce((s, b) => s + b.amount, 0);
      const remaining = chequeTotal - currentTotal;
      const assignedAmt = outstandingAmt <= remaining ? outstandingAmt : remaining;
      setMultiBills(prev => [...prev, {
        billNo: data.bill_no ?? inp,
        partyName: data.party_name ?? partyName,
        amount: assignedAmt,
        outstanding: outstandingAmt,
      }]);
      setNextBillInput("");
      setTimeout(() => nextBillRef.current?.focus(), 50);
    } catch {
      toast({ variant: "destructive", title: "Lookup failed" });
    } finally {
      setNextBillLoading(false);
    }
  };

  const multiBillTotal = multiBills.reduce((s, b) => s + b.amount, 0);
  const multiBillRemaining = chequeTotal - multiBillTotal;

  const lastBillMismatch = multiBills.length > 1 && (() => {
    const lastBill = multiBills[multiBills.length - 1];
    const othersTotal = multiBills.slice(0, -1).reduce((s, b) => s + b.amount, 0);
    const lastAllocated = chequeTotal - othersTotal;
    return Math.abs(lastAllocated - lastBill.outstanding) > 0.01;
  })();

  const confirmMultiBills = () => {
    if (multiBills.length > 1) {
      const othersTotal = multiBills.slice(0, -1).reduce((s, b) => s + b.outstanding, 0);
      const lastAmount = Math.round((chequeTotal - othersTotal) * 100) / 100;
      setMultiBills(prev => prev.map((b, i) =>
        i === prev.length - 1 ? { ...b, amount: lastAmount } : { ...b, amount: b.outstanding }
      ));
    }
    setMultiBillOpen(false);
    focusNext(chequeNoRef);
  };

  const buildChequeDate = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(chequeDay).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const doSave = async (force = false) => {
    const chequeDate = buildChequeDate();
    const billsToSave = multiBills.length > 0 ? multiBills : [{ billNo, partyName, amount: Number(chequeAmount), outstanding: Number(chequeAmount) }];

    if (!partyName || !chequeNo || !bankName || !chequeDay) {
      toast({ variant: "destructive", title: "Missing fields", description: "Please fill all required fields." });
      return;
    }

    let savedCount = 0;
    for (const bill of billsToSave) {
      try {
        await new Promise<void>((resolve, reject) => {
          createEntry.mutate({
            data: {
              entryDate,
              chequeDate,
              billNos: [bill.billNo],
              partyName: bill.partyName || partyName,
              chequeAmount: bill.amount || Number(chequeAmount),
              chequeNo,
              bankName,
            }
          }, {
            onSuccess: () => { savedCount++; resolve(); },
            onError: (err: any) => {
              if (!force && err?.status === 409) {
                setDuplicateWarning({ open: true, saveData: { force: true } });
                reject(err);
              } else {
                reject(err);
              }
            }
          });
        });
      } catch {
        break;
      }
    }

    if (savedCount === billsToSave.length) {
      try {
        if (multiBills.length > 0) {
          for (let i = 0; i < multiBills.length; i++) {
            const bill = multiBills[i];
            const nextBillNo = i < multiBills.length - 1 ? multiBills[i + 1].billNo : null;
            await updateBillInSupabase(bill.billNo, {
              cheque_date: chequeDate,
              bank_name: bankName,
              cheque_no: chequeNo,
              cheque_amount: bill.amount,
              collected_amount: bill.amount,
              next_bill_no: nextBillNo,
              payment_date: format(new Date(entryDate), "dd/MM/yyyy"),
            });
          }
        } else if (supaBillNo) {
          await updateBillInSupabase(supaBillNo, {
            cheque_date: chequeDate,
            bank_name: bankName,
            cheque_no: chequeNo,
            next_bill_no: null,
            payment_date: format(new Date(entryDate), "dd/MM/yyyy"),
          });
        }
      } catch (supaErr) {
        console.warn("Supabase update failed:", supaErr);
      }
      toast({ title: "✓ Saved", description: `${savedCount} entr${savedCount > 1 ? "ies" : "y"} saved — Supabase bhi update hua.` });
      resetForm();
    }
  };

  const handleSaveKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); doSave(); }
    if (e.key === "ArrowUp") { e.preventDefault(); focusNext(bankRef); }
  };

  return (
    <div className="max-w-xl mx-auto pb-24">
      <Card className="border-t-4 border-t-primary shadow-xl">
        <CardHeader className="bg-primary/5 pb-5 border-b">
          <CardTitle className="text-2xl font-bold text-primary flex items-center gap-2">
            <Receipt className="h-6 w-6" /> Cheque Entry
          </CardTitle>
          <CardDescription>↑ ↓ Arrow keys ya Enter se navigate karein — mouse ki zaroorat nahi.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-semibold text-xs mb-1 block">Entry Date</Label>
              <Input
                ref={entryDateRef}
                type="date"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                className="h-11 bg-white"
                onKeyDown={e => nav(e, chequeDayRef)}
              />
            </div>
            <div>
              <Label className="font-semibold text-xs mb-1 flex justify-between">
                <span>Cheque Date (DD)</span>
                <span className="text-muted-foreground font-normal">{format(new Date(), "MMM yyyy")}</span>
              </Label>
              <Input
                ref={chequeDayRef}
                type="text"
                placeholder="DD"
                maxLength={2}
                value={chequeDay}
                onChange={e => setChequeDay(e.target.value)}
                className="h-11 text-center text-lg font-bold tracking-widest bg-white"
                onKeyDown={e => nav(e, billNoRef, entryDateRef)}
              />
            </div>
          </div>

          <div>
            <Label className="font-semibold text-xs mb-1 block">Bill No</Label>
            <div className="relative">
              <Input
                ref={billNoRef}
                type="text"
                placeholder="e.g. 744 or GST00744"
                value={billNo}
                onChange={e => setBillNo(e.target.value)}
                onKeyDown={handleBillNoKey}
                className="h-11 bg-white pr-20"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {lookupLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {billSource === "supabase" && !lookupLoading && (
                  <Badge variant="outline" className="text-xs text-green-700 border-green-400 bg-green-50">Supabase</Badge>
                )}
                {billSource === "localdb" && !lookupLoading && (
                  <Badge variant="outline" className="text-xs text-blue-700 border-blue-400 bg-blue-50">Saved</Badge>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Enter karo to party + amount auto-fill hoga</p>
          </div>

          {multiBills.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-amber-800">Multi-Bill ({multiBills.length} bills)</span>
                <span className="text-xs text-amber-700">Total: {fmtINR(multiBillTotal)} / {fmtINR(chequeTotal)}</span>
              </div>
              {multiBills.map((b, i) => {
                const isLast = i === multiBills.length - 1;
                const othersOut = multiBills.slice(0, i).reduce((s, x) => s + x.outstanding, 0);
                const effectiveAmt = isLast && multiBills.length > 1
                  ? Math.round((chequeTotal - othersOut) * 100) / 100
                  : b.outstanding || b.amount;
                const mismatch = isLast && multiBills.length > 1 && Math.abs(effectiveAmt - b.outstanding) > 0.01;
                return (
                  <div key={i} className="flex justify-between text-xs text-amber-900 bg-white rounded px-2 py-1 border border-amber-100">
                    <span className="font-mono">{b.billNo}</span>
                    <span className={`font-medium ${mismatch ? "text-red-600 font-bold" : ""}`}>{fmtINR(effectiveAmt)}</span>
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-1 text-xs border-amber-300 text-amber-800"
                onClick={() => setMultiBillOpen(true)}
              >
                Bills Edit/Add Karo
              </Button>
            </div>
          )}

          <div>
            <Label className="font-semibold text-xs mb-1 flex justify-between">
              <span>Party Name</span>
              {billNetAmt != null && (
                <span className="font-normal text-green-700">
                  Bill Amt: <strong>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(billNetAmt)}</strong>
                </span>
              )}
            </Label>
            <Input
              ref={partyRef}
              type="text"
              placeholder="Auto-fill ya manually type"
              value={partyName}
              onChange={e => setPartyName(e.target.value)}
              onKeyDown={e => nav(e, amountRef, billNoRef)}
              className="h-11 bg-white font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-semibold text-xs mb-1 block">Amount (₹)</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={amountRef}
                  type="number"
                  value={chequeAmount}
                  onChange={e => setChequeAmount(e.target.value)}
                  onKeyDown={e => nav(e, chequeNoRef, partyRef)}
                  className="h-11 pl-8 text-lg font-bold text-primary bg-white"
                  disabled={multiBills.length > 0}
                />
              </div>
              {multiBills.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Multi-bill se auto</p>
              )}
              {chequeAmount && multiBills.length === 0 && (
                <p className="text-xs text-right text-muted-foreground mt-1">
                  {fmtINR(Number(chequeAmount))}
                </p>
              )}
            </div>
            <div>
              <Label className="font-semibold text-xs mb-1 block">Cheque No</Label>
              <Input
                ref={chequeNoRef}
                type="text"
                placeholder="000000"
                value={chequeNo}
                onChange={e => setChequeNo(e.target.value)}
                onKeyDown={e => nav(e, bankRef, amountRef)}
                className="h-11 font-mono tracking-widest bg-white"
              />
            </div>
          </div>

          <div>
            <Label className="font-semibold text-xs mb-1 block">Bank Name</Label>
            <Input
              ref={bankRef}
              type="text"
              list="bank-list"
              placeholder="Type or select bank..."
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              onKeyDown={e => nav(e, saveRef, chequeNoRef)}
              className="h-11 bg-white"
            />
            <datalist id="bank-list">
              {banks?.map((b: { id: number; name: string }) => <option key={b.id} value={b.name} />)}
            </datalist>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-2xl sm:relative sm:p-0 sm:border-0 sm:shadow-none sm:mt-2 z-50">
            <div className="flex gap-3 max-w-xl mx-auto">
              <Button
                type="button"
                variant="outline"
                className="h-14 w-1/3 bg-white"
                onClick={resetForm}
              >
                Clear
              </Button>
              <Button
                ref={saveRef}
                type="button"
                className="h-14 w-2/3 bg-accent hover:bg-accent/90 text-accent-foreground text-lg font-bold shadow-lg"
                disabled={createEntry.isPending}
                onClick={() => doSave()}
                onKeyDown={handleSaveKey}
              >
                {createEntry.isPending
                  ? <Loader2 className="animate-spin mr-2" />
                  : <CheckCircle2 className="h-5 w-5 mr-2" />}
                Save Entry
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={multiBillOpen} onOpenChange={setMultiBillOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-amber-600" />
              Multi-Bill Entry
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex justify-between text-sm font-medium p-3 bg-slate-50 rounded-lg">
              <span>Cheque Total:</span>
              <span className="text-primary font-bold">{fmtINR(chequeTotal)}</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {multiBills.map((b, i) => {
                const isLast = i === multiBills.length - 1;
                const othersTotal = multiBills.slice(0, i).reduce((s, x) => s + x.outstanding, 0);
                const effectiveAmt = isLast && multiBills.length > 1
                  ? Math.round((chequeTotal - othersTotal) * 100) / 100
                  : b.outstanding || b.amount;
                const mismatch = isLast && multiBills.length > 1 && Math.abs(effectiveAmt - b.outstanding) > 0.01;
                return (
                  <div key={i} className={`flex items-center gap-2 p-2 bg-white border rounded-md ${mismatch ? "border-red-300 bg-red-50" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-bold text-primary">{b.billNo}</p>
                      <p className="text-xs text-muted-foreground truncate">{b.partyName}</p>
                      {b.outstanding > 0 && (
                        <p className="text-xs text-muted-foreground">Outstanding: {fmtINR(b.outstanding)}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-sm font-bold whitespace-nowrap ${mismatch ? "text-red-600" : "text-green-700"}`}>
                        {fmtINR(effectiveAmt)}
                      </span>
                      {mismatch && (
                        <p className="text-xs text-red-500">
                          {effectiveAmt > b.outstanding ? `+${fmtINR(effectiveAmt - b.outstanding)}` : `-${fmtINR(b.outstanding - effectiveAmt)}`}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10 flex-shrink-0"
                      onClick={() => setMultiBills(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className={`flex justify-between text-sm font-semibold p-2 rounded-lg border-2 ${lastBillMismatch ? "bg-red-50 border-red-300 text-red-800" : multiBillRemaining === 0 ? "bg-green-50 border-green-300 text-green-800" : "bg-amber-50 border-amber-300 text-amber-800"}`}>
              <span>{lastBillMismatch ? "⚠ Last bill amount mismatch!" : multiBillRemaining === 0 ? "✓ Sab match!" : "Baaki raha:"}</span>
              <span>{multiBillRemaining !== 0 && fmtINR(Math.abs(multiBillRemaining))}</span>
            </div>

            {multiBillRemaining > 0 && (
              <div className="flex gap-2">
                <Input
                  ref={nextBillRef}
                  placeholder={`Next bill no (baaki: ${fmtINR(multiBillRemaining)})`}
                  value={nextBillInput}
                  onChange={e => setNextBillInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNextBill(); } }}
                  className="h-10"
                  autoFocus
                />
                <Button onClick={addNextBill} disabled={nextBillLoading} className="h-10 px-3">
                  {nextBillLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMultiBillOpen(false)}>Cancel</Button>
            <Button
              onClick={confirmMultiBills}
              disabled={multiBills.length < 2 && multiBillRemaining > 0}
              className={lastBillMismatch ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-green-600 hover:bg-green-700 text-white"}
            >
              {multiBills.length < 2
                ? "Pehle bills add karo"
                : lastBillMismatch
                ? "⚠ Mismatch ke saath Confirm"
                : "✓ Confirm All Bills"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={duplicateWarning.open} onOpenChange={o => !o && setDuplicateWarning({ open: false, saveData: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center text-amber-600 gap-2">
              <AlertTriangle className="h-5 w-5" />
              Possible Duplicate Cheque
            </AlertDialogTitle>
            <AlertDialogDescription>
              Is cheque number aur bank ke saath already entry hai. Phir bhi save karein?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => doSave(true)}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Haan, Save Karo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
