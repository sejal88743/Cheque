import { useState, useRef } from "react";
import { useGetSettings, useUpdateSettings, useListBanks, useCreateBank, useDeleteBank, getListBanksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Building, Save, Upload, CheckCircle2, Loader2 } from "lucide-react";
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
} from "@/components/ui/dialog";

const settingsSchema = z.object({
  bankName: z.string().min(1, "Required"),
  accountNo: z.string().min(1, "Required"),
  mobileNo: z.string().min(1, "Required"),
});

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
  const fileRef = useRef<HTMLInputElement>(null);

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
      onSuccess: () => toast({ title: "Success", description: "Settings updated." }),
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

  const handleXlsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

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
        toast({ variant: "destructive", title: "No bank names found", description: "XLS me koi text data nahi mila." });
        return;
      }
      setXlsPreview(names);
      setXlsDialogOpen(true);
    } catch (err) {
      toast({ variant: "destructive", title: "File read error", description: "XLS file parse nahi ho sake." });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleXlsConfirm = async () => {
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
    toast({ title: `${added} banks added`, description: "Bank master update ho gaya." });
  };

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="shadow-md">
        <CardHeader className="bg-slate-50 border-b pb-4">
          <CardTitle className="text-xl">Report Header Information</CardTitle>
          <CardDescription>Details shown on printed deposit slip.</CardDescription>
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
          <CardDescription>Banks ki list manage karein — manually ya XLS se.</CardDescription>
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
            <input
              ref={fileRef}
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={handleXlsFile}
            />
            <Button
              variant="outline"
              className="w-full border-dashed border-2 h-10 text-muted-foreground hover:text-primary hover:border-primary"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              XLS File se Banks Upload Karo
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto border rounded-md divide-y">
            {banks?.map(bank => (
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
            {banks?.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">No banks found.</div>
            )}
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
            <Button onClick={handleXlsConfirm} disabled={xlsUploading} className="bg-primary">
              {xlsUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sab Add Karo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
