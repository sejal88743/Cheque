import { useState, useEffect } from "react";
import { supabase, SupaBill } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return d; }
};

const fmtAmt = (n: number | null) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
};

export default function Bills() {
  const [rows, setRows] = useState<SupaBill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    partyName: "",
    billNo: "",
    chequeNo: "",
    dateFrom: "",
    dateTo: "",
    paymentMode: "cheque",
  });
  const [applied, setApplied] = useState(filters);

  const fetchBills = async (f: typeof filters) => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("bills")
        .select("*")
        .order("date", { ascending: false })
        .limit(500);

      if (f.paymentMode) query = query.ilike("payment_mode", `%${f.paymentMode}%`);
      if (f.partyName) query = query.ilike("party_name", `%${f.partyName}%`);
      if (f.billNo) query = query.ilike("bill_no", `%${f.billNo}%`);
      if (f.chequeNo) query = query.ilike("cheque_no", `%${f.chequeNo}%`);
      if (f.dateFrom) query = query.gte("date", f.dateFrom);
      if (f.dateTo) query = query.lte("date", f.dateTo);

      const { data, error: err } = await query;
      if (err) throw err;
      setRows(data ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch bills");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBills(applied); }, []);

  const handleApply = () => {
    setApplied(filters);
    fetchBills(filters);
  };

  const handleReset = () => {
    const reset = { partyName: "", billNo: "", chequeNo: "", dateFrom: "", dateTo: "", paymentMode: "cheque" };
    setFilters(reset);
    setApplied(reset);
    fetchBills(reset);
  };

  const totalAmt = rows.reduce((s, r) => s + (r.cheque_amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight text-primary">Supabase Bills</h2>
        <Button variant="outline" size="sm" onClick={() => fetchBills(applied)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b bg-slate-50/50">
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block">Payment Mode</label>
              <Input
                placeholder="e.g. cheque"
                value={filters.paymentMode}
                onChange={e => setFilters({ ...filters, paymentMode: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Party Name</label>
              <Input
                placeholder="Search party..."
                value={filters.partyName}
                onChange={e => setFilters({ ...filters, partyName: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Bill No</label>
              <Input
                placeholder="Search bill..."
                value={filters.billNo}
                onChange={e => setFilters({ ...filters, billNo: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Cheque No</label>
              <Input
                placeholder="Search cheque..."
                value={filters.chequeNo}
                onChange={e => setFilters({ ...filters, chequeNo: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">From Date</label>
              <Input type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">To Date</label>
              <Input type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="outline" onClick={handleReset}>Reset</Button>
            <Button onClick={handleApply} className="bg-primary text-primary-foreground" disabled={loading}>
              <Search className="h-4 w-4 mr-2" /> Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader className="py-4 border-b bg-white">
          <CardTitle className="text-lg flex justify-between items-center">
            <span>Results</span>
            <div className="text-sm font-normal text-muted-foreground flex gap-4">
              <span>Total Rows: <strong className="text-foreground">{rows.length}</strong></span>
              <span>Total Cheque Amt: <strong className="text-primary">{fmtAmt(totalAmt)}</strong></span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-4 text-destructive text-sm bg-destructive/5 border-b">
              ⚠ Error: {error}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading from Supabase...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Bill No</TableHead>
                    <TableHead className="font-semibold">Party Name</TableHead>
                    <TableHead className="font-semibold">Payment Mode</TableHead>
                    <TableHead className="font-semibold">Cheque No</TableHead>
                    <TableHead className="font-semibold">Cheque Date</TableHead>
                    <TableHead className="font-semibold">Bank Name</TableHead>
                    <TableHead className="font-semibold text-right">Cheque Amt</TableHead>
                    <TableHead className="font-semibold text-right">Bill Net Amt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No bills found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{fmtDate(row.date)}</TableCell>
                        <TableCell className="font-mono text-xs">{row.bill_no ?? "—"}</TableCell>
                        <TableCell className="font-medium">{row.party_name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {row.payment_mode ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs tracking-wider">{row.cheque_no ?? "—"}</TableCell>
                        <TableCell>{fmtDate(row.cheque_date)}</TableCell>
                        <TableCell>{row.bank_name ?? "—"}</TableCell>
                        <TableCell className="text-right font-bold text-primary">{fmtAmt(row.cheque_amount)}</TableCell>
                        <TableCell className="text-right">{fmtAmt(row.bill_net_amt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
