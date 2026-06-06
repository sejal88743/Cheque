import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Link } from "wouter";
import { 
  useListChequeEntries, 
  useGetChequeStats, 
  useGetSettings, 
  getListChequeEntriesQueryKey, 
  getGetChequeStatsQueryKey, 
  useDeleteChequeEntry,
  useUpdateChequeEntry
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, Search, Trash2, Edit, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function Reports() {
  const [filters, setFilters] = useState({
    partyName: "",
    chequeNo: "",
    bankName: "",
    entryDateFrom: format(new Date(), "yyyy-MM-dd"),
    entryDateTo: format(new Date(), "yyyy-MM-dd"),
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const { toast } = useToast();

  const { data: entries, refetch } = useListChequeEntries(appliedFilters, { 
    query: { queryKey: getListChequeEntriesQueryKey(appliedFilters) } 
  });
  const { data: stats, refetch: refetchStats } = useGetChequeStats(appliedFilters, {
    query: { queryKey: getGetChequeStatsQueryKey(appliedFilters) }
  });
  const { data: settings } = useGetSettings();
  const deleteEntry = useDeleteChequeEntry();
  const updateEntry = useUpdateChequeEntry();

  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});

  const handleApply = () => setAppliedFilters(filters);
  const handleReset = () => {
    const reset = {
      partyName: "",
      chequeNo: "",
      bankName: "",
      entryDateFrom: "",
      entryDateTo: "",
    };
    setFilters(reset);
    setAppliedFilters(reset);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this entry?")) {
      deleteEntry.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Deleted", description: "Entry deleted successfully" });
          refetch();
          refetchStats();
        }
      });
    }
  };

  const openEdit = (entry: any) => {
    setEditingEntry(entry);
    setEditForm({
      entryDate: entry.entryDate,
      chequeDate: entry.chequeDate,
      partyName: entry.partyName,
      chequeAmount: entry.chequeAmount,
      chequeNo: entry.chequeNo,
      bankName: entry.bankName,
      billNos: entry.billNos.join(", ")
    });
  };

  const handleSaveEdit = () => {
    updateEntry.mutate({
      id: editingEntry.id,
      data: {
        ...editForm,
        chequeAmount: Number(editForm.chequeAmount),
        billNos: editForm.billNos.split(",").map((s: string) => s.trim()).filter(Boolean)
      }
    }, {
      onSuccess: () => {
        toast({ title: "Updated", description: "Entry updated successfully" });
        setEditingEntry(null);
        refetch();
        refetchStats();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="no-print flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold tracking-tight text-primary">Reports & Search</h2>
        <Link href="/" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
          <Plus className="h-4 w-4 mr-2" /> New Entry
        </Link>
      </div>

      <div className="no-print">
        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b bg-slate-50/50">
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold mb-1 block">From Date</label>
                <Input type="date" value={filters.entryDateFrom} onChange={e => setFilters({...filters, entryDateFrom: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">To Date</label>
                <Input type="date" value={filters.entryDateTo} onChange={e => setFilters({...filters, entryDateTo: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Party Name</label>
                <Input placeholder="Search party..." value={filters.partyName} onChange={e => setFilters({...filters, partyName: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block">Bank Name</label>
                <Input placeholder="Search bank..." value={filters.bankName} onChange={e => setFilters({...filters, bankName: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="outline" onClick={handleReset}>Reset</Button>
              <Button onClick={handleApply} className="bg-primary text-primary-foreground"><Search className="h-4 w-4 mr-2" /> Apply</Button>
              <Button onClick={handlePrint} variant="secondary" className="bg-accent text-accent-foreground hover:bg-accent/90"><Printer className="h-4 w-4 mr-2" /> Print Deposit Slip</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md">
        <CardHeader className="py-4 border-b bg-white print:hidden">
          <CardTitle className="text-lg flex justify-between items-center">
            Results
            <div className="text-sm font-normal text-muted-foreground flex gap-4">
              <span>Total Cheques: <strong className="text-foreground">{stats?.totalCheques || 0}</strong></span>
              <span>Total Amount: <strong className="text-foreground text-primary">₹{(stats?.totalAmount || 0).toLocaleString('en-IN')}</strong></span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          
          {/* PRINT HEADER - ONLY VISIBLE ON PRINT */}
          <div className="hidden print:block mb-8 text-center border-b-2 border-black pb-4">
            <h1 className="text-2xl font-bold uppercase mb-2">Bank Deposit Report</h1>
            <div className="flex justify-between text-left text-sm font-bold mt-4">
              <div>
                <p>Bank Name: {settings?.bankName || '________________'}</p>
                <p>Account No: {settings?.accountNo || '________________'}</p>
              </div>
              <div className="text-right">
                <p>Mobile: {settings?.mobileNo || '________________'}</p>
                <p>Date: {format(new Date(), "dd/MM/yyyy")}</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="w-full text-sm print:text-xs">
              <TableHeader className="bg-slate-50 print:bg-transparent">
                <TableRow className="print:border-black print:border-y-2">
                  <TableHead className="font-semibold print:text-black print:font-bold">Entry Date</TableHead>
                  <TableHead className="font-semibold print:text-black print:font-bold">Cheque Date</TableHead>
                  <TableHead className="font-semibold print:text-black print:font-bold">Bill Nos</TableHead>
                  <TableHead className="font-semibold print:text-black print:font-bold">Party Name</TableHead>
                  <TableHead className="font-semibold print:text-black print:font-bold text-right">Amount</TableHead>
                  <TableHead className="font-semibold print:text-black print:font-bold">Cheque No</TableHead>
                  <TableHead className="font-semibold print:text-black print:font-bold">Bank Name</TableHead>
                  <TableHead className="text-right no-print">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No entries found.</TableCell>
                  </TableRow>
                ) : (
                  entries?.map((entry) => (
                    <TableRow key={entry.id} className="print:border-b print:border-gray-400">
                      <TableCell>{format(new Date(entry.entryDate), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{format(new Date(entry.chequeDate), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="font-mono text-xs print:font-bold">{entry.billNos.join(" + ")}</TableCell>
                      <TableCell className="font-medium print:font-bold">{entry.partyName}</TableCell>
                      <TableCell className="text-right font-bold">₹{entry.chequeAmount.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="font-mono text-xs tracking-wider print:font-bold">{entry.chequeNo}</TableCell>
                      <TableCell className="print:font-bold">{entry.bankName}</TableCell>
                      <TableCell className="text-right no-print">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => openEdit(entry)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(entry.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {/* PRINT FOOTER ROW */}
                <TableRow className="hidden print:table-row font-bold border-t-2 border-black bg-gray-100">
                  <TableCell colSpan={4} className="text-right uppercase">Totals:</TableCell>
                  <TableCell className="text-right">₹{(stats?.totalAmount || 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell colSpan={3}>Cheques: {stats?.totalCheques || 0}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Cheque Entry</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Entry Date</Label>
                <Input type="date" value={editForm.entryDate || ""} onChange={e => setEditForm({...editForm, entryDate: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Cheque Date</Label>
                <Input type="date" value={editForm.chequeDate || ""} onChange={e => setEditForm({...editForm, chequeDate: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Party Name</Label>
              <Input value={editForm.partyName || ""} onChange={e => setEditForm({...editForm, partyName: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Bill Nos (comma separated)</Label>
              <Input value={editForm.billNos || ""} onChange={e => setEditForm({...editForm, billNos: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input type="number" value={editForm.chequeAmount || ""} onChange={e => setEditForm({...editForm, chequeAmount: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Cheque No</Label>
                <Input value={editForm.chequeNo || ""} onChange={e => setEditForm({...editForm, chequeNo: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bank Name</Label>
              <Input value={editForm.bankName || ""} onChange={e => setEditForm({...editForm, bankName: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 20mm; }
          body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          table { width: 100%; border-collapse: collapse; text-align: center; }
          th, td { border: 1px solid #000; padding: 6px; font-weight: bold; color: black; }
          .container { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
          header { display: none !important; }
        }
      `}</style>
    </div>
  );
}
