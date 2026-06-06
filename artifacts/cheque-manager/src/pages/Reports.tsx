import { useState, useCallback } from "react";
import { format } from "date-fns";
import { Link } from "wouter";
import { supabase, SupaBill } from "@/lib/supabase";
import { useGetSettings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, Search, Plus, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GroupedRow {
  chequeDate: string | null;
  chequeNo: string;
  bankName: string;
  chequeAmt: number;
  billNos: string;
  partyNames: string;
  rowCount: number;
}

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return d; }
};

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const extractBillNum = (billNo: string | null): string => {
  if (!billNo) return "";
  const match = billNo.match(/(\d+)$/);
  if (!match) return billNo;
  return String(parseInt(match[1], 10));
};

const parsePayDate = (s: string | null | undefined): Date | null => {
  if (!s || !s.trim()) return null;
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmm) return new Date(`${ddmm[3]}-${ddmm[2].padStart(2,"0")}-${ddmm[1].padStart(2,"0")}`);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.slice(0, 10));
  return null;
};

const groupRows = (rows: SupaBill[]): GroupedRow[] => {
  const map = new Map<string, SupaBill[]>();
  for (const row of rows) {
    const key = `${row.cheque_no ?? ""}|||${row.cheque_date ?? ""}|||${row.bank_name ?? ""}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return Array.from(map.values())
    .map(grp => {
      const first = grp[0];
      const totalAmt = grp.reduce((s, r) => s + Number(r.cheque_amount ?? 0), 0);
      const billNos = grp.map(r => extractBillNum(r.bill_no)).filter(Boolean).join("+");
      const parties = [...new Set(grp.map(r => r.party_name).filter(Boolean))].join(", ");
      return {
        chequeDate: first.cheque_date,
        chequeNo: first.cheque_no ?? "—",
        bankName: first.bank_name ?? "—",
        chequeAmt: totalAmt,
        billNos,
        partyNames: parties,
        rowCount: grp.length,
      };
    })
    .sort((a, b) => {
      if (!a.chequeDate) return 1;
      if (!b.chequeDate) return -1;
      return b.chequeDate.localeCompare(a.chequeDate);
    });
};

const PAGE_SIZE = 1000;

export default function Reports() {
  const { toast } = useToast();
  const { data: settings } = useGetSettings();

  const [filters, setFilters] = useState({
    partyName: "",
    chequeNo: "",
    bankName: "",
    chequeDateFrom: "",
    chequeDateTo: "",
    paymentDateFrom: "",
    paymentDateTo: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const [loading, setLoading] = useState(false);
  const [grouped, setGrouped] = useState<GroupedRow[]>([]);
  const [fetched, setFetched] = useState(false);

  const fetchAll = useCallback(async (f: typeof filters) => {
    setLoading(true);
    setFetched(false);
    try {
      let allRows: SupaBill[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from("bills")
          .select("cheque_no,cheque_date,bank_name,cheque_amount,bill_no,party_name,bill_net_amt,payment_mode,payment_date")
          .not("cheque_no", "is", null)
          .ilike("payment_mode", "%cheque%")
          .order("cheque_date", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (f.partyName) q = q.ilike("party_name", `%${f.partyName}%`);
        if (f.chequeNo) q = q.ilike("cheque_no", `%${f.chequeNo}%`);
        if (f.bankName) q = q.ilike("bank_name", `%${f.bankName}%`);
        if (f.chequeDateFrom) q = q.gte("cheque_date", f.chequeDateFrom);
        if (f.chequeDateTo) q = q.lte("cheque_date", f.chequeDateTo);

        const { data, error } = await q;
        if (error) throw error;
        allRows = allRows.concat(data ?? []);
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      let filtered = allRows;
      if (f.paymentDateFrom || f.paymentDateTo) {
        const from = f.paymentDateFrom ? new Date(f.paymentDateFrom) : null;
        const to = f.paymentDateTo ? new Date(f.paymentDateTo + "T23:59:59") : null;
        filtered = allRows.filter(row => {
          const pd = parsePayDate(row.payment_date);
          if (!pd) return false;
          if (from && pd < from) return false;
          if (to && pd > to) return false;
          return true;
        });
      }
      setGrouped(groupRows(filtered));
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, []);

  const handleApply = () => {
    setAppliedFilters(filters);
    fetchAll(filters);
  };

  const handleReset = () => {
    const reset = { partyName: "", chequeNo: "", bankName: "", chequeDateFrom: "", chequeDateTo: "", paymentDateFrom: "", paymentDateTo: "" };
    setFilters(reset);
    setAppliedFilters(reset);
    fetchAll(reset);
  };

  const totalAmt = grouped.reduce((s, r) => s + r.chequeAmt, 0);
  const totalBills = grouped.reduce((s, r) => s + r.rowCount, 0);

  return (
    <div className="space-y-4">
      <div className="no-print flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight text-primary">Reports</h2>
        <div className="flex gap-2">
          <Link href="/" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3">
            <Plus className="h-4 w-4 mr-1" /> New Entry
          </Link>
          <Button onClick={() => window.print()} variant="secondary" className="h-9 px-3 bg-accent text-accent-foreground hover:bg-accent/90">
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
        </div>
      </div>

      <div className="no-print">
        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-slate-50/50">
            <CardTitle className="text-base">Filters — Supabase Data</CardTitle>
          </CardHeader>
          <CardContent className="pt-3 px-4 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block">Cheque Date From</label>
                <Input type="date" value={filters.chequeDateFrom} onChange={e => setFilters({ ...filters, chequeDateFrom: e.target.value })} className="h-9" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Cheque Date To</label>
                <Input type="date" value={filters.chequeDateTo} onChange={e => setFilters({ ...filters, chequeDateTo: e.target.value })} className="h-9" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Entry Date From</label>
                <Input type="date" value={filters.paymentDateFrom} onChange={e => setFilters({ ...filters, paymentDateFrom: e.target.value })} className="h-9" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Entry Date To</label>
                <Input type="date" value={filters.paymentDateTo} onChange={e => setFilters({ ...filters, paymentDateTo: e.target.value })} className="h-9" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Party Name</label>
                <Input placeholder="Search party..." value={filters.partyName} onChange={e => setFilters({ ...filters, partyName: e.target.value })} className="h-9" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Cheque No</label>
                <Input placeholder="Search cheque no..." value={filters.chequeNo} onChange={e => setFilters({ ...filters, chequeNo: e.target.value })} className="h-9" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Bank Name</label>
                <Input placeholder="Search bank..." value={filters.bankName} onChange={e => setFilters({ ...filters, bankName: e.target.value })} className="h-9" />
              </div>
            </div>
            <div className="flex gap-2 mt-3 justify-end">
              <Button variant="outline" onClick={handleReset} className="h-9" disabled={loading}>Reset</Button>
              <Button onClick={handleApply} className="bg-primary text-primary-foreground h-9" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                Apply
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md">
        <CardHeader className="py-3 px-4 border-b bg-white print:hidden">
          <CardTitle className="text-base flex justify-between items-center">
            <span className="flex items-center gap-2">
              Results
              {fetched && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fetchAll(appliedFilters)} disabled={loading}>
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </Button>
              )}
            </span>
            <div className="text-sm font-normal text-muted-foreground flex gap-4">
              <span>Cheques: <strong className="text-foreground">{grouped.length}</strong></span>
              <span>Bills: <strong className="text-foreground">{totalBills}</strong></span>
              <span>Total: <strong className="text-primary">{fmtINR(totalAmt)}</strong></span>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          {/* PRINT HEADER */}
          <div className="hidden print:block mb-4 text-center border-b-2 border-black pb-2">
            <h1 className="text-xl font-bold uppercase">Bank Deposit Report</h1>
            <div className="flex justify-between mt-2" style={{ fontSize: "20px", fontWeight: "bold" }}>
              <div>
                <p>Bank: {settings?.bankName || "________________"}</p>
                <p>A/c: {settings?.accountNo || "________________"}</p>
              </div>
              <div className="text-right">
                <p>Mobile: {settings?.mobileNo || "________________"}</p>
                <p>Date: {format(new Date(), "dd/MM/yyyy")}</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading from Supabase...
            </div>
          ) : !fetched ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <p>Filters set karke Apply karo</p>
              <Button onClick={handleApply} className="bg-primary text-primary-foreground">
                <Search className="h-4 w-4 mr-2" /> Load Data
              </Button>
            </div>
          ) : grouped.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Koi cheque entry nahi mili.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm print:text-[10px]">
                <TableHeader className="bg-slate-50 print:bg-transparent">
                  <TableRow className="print:border-y-2 print:border-black">
                    <TableHead className="font-bold print:text-black w-24">Chq Date</TableHead>
                    <TableHead className="font-bold print:text-black text-right w-28">Chq Amt</TableHead>
                    <TableHead className="font-bold print:text-black w-28">Chq No</TableHead>
                    <TableHead className="font-bold print:text-black">Bank</TableHead>
                    <TableHead className="font-bold print:text-black">Bill No(s)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map((row, i) => (
                    <TableRow key={i} className="print:border-b print:border-gray-400">
                      <TableCell className="py-2 print:py-1">{fmtDate(row.chequeDate)}</TableCell>
                      <TableCell className="py-2 print:py-1 text-right font-bold text-primary print:text-black">
                        {fmtINR(row.chequeAmt)}
                      </TableCell>
                      <TableCell className="py-2 print:py-1 font-mono text-xs tracking-wider">{row.chequeNo}</TableCell>
                      <TableCell className="py-2 print:py-1 text-xs">{row.bankName}</TableCell>
                      <TableCell className="py-2 print:py-1 font-mono text-xs font-semibold">
                        {row.billNos}
                        {row.rowCount > 1 && (
                          <span className="ml-1 text-[10px] text-muted-foreground print:hidden">
                            ({row.rowCount} bills)
                          </span>
                        )}
                        {row.partyNames && (
                          <span className="ml-2 font-sans font-normal not-italic text-[10px] print:text-[9px] text-muted-foreground print:text-black">
                            {row.partyNames.slice(0, 12)}{row.partyNames.length > 12 ? "." : ""}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* PRINT TOTAL ROW */}
                  <TableRow className="hidden print:table-row font-bold border-t-2 border-black">
                    <TableCell className="text-right font-bold" colSpan={1}>Total:</TableCell>
                    <TableCell className="text-right font-bold">{fmtINR(totalAmt)}</TableCell>
                    <TableCell colSpan={3} className="font-bold">Cheques: {grouped.length} | Bills: {totalBills}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 6mm 8mm; }
          body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 3px 5px; color: black; }
          .container { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
          header { display: none !important; }
        }
      `}</style>
    </div>
  );
}
