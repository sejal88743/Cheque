import { useState } from "react";
import { useGetSettings, useUpdateSettings, useListBanks, useCreateBank, useDeleteBank, getListBanksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Building, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

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

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      bankName: settings?.bankName || "",
      accountNo: settings?.accountNo || "",
      mobileNo: settings?.mobileNo || ""
    },
    values: settings ? {
      bankName: settings.bankName || "",
      accountNo: settings.accountNo || "",
      mobileNo: settings.mobileNo || ""
    } : undefined
  });

  const onSettingsSubmit = (values: z.infer<typeof settingsSchema>) => {
    updateSettings.mutate({ data: values }, {
      onSuccess: () => toast({ title: "Success", description: "Settings updated successfully." })
    });
  };

  const handleAddBank = () => {
    if (!newBankName) return;
    createBank.mutate({ data: { name: newBankName } }, {
      onSuccess: () => {
        setNewBankName("");
        toast({ title: "Bank Added" });
        refetchBanks();
      }
    });
  };

  const handleDeleteBank = (id: number) => {
    deleteBank.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Bank Deleted" });
        refetchBanks();
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="shadow-md">
        <CardHeader className="bg-slate-50 border-b pb-4">
          <CardTitle className="text-xl">Report Header Information</CardTitle>
          <CardDescription>Details shown on the printed deposit slip.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSettingsSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Bank Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accountNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Number</FormLabel>
                    <FormControl>
                      <Input {...field} className="font-mono tracking-widest" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mobileNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
          <CardDescription>Manage the list of autocomplete banks.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 flex flex-col h-[400px]">
          <div className="flex gap-2 mb-4">
            <Input 
              placeholder="Add new bank..." 
              value={newBankName} 
              onChange={e => setNewBankName(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleAddBank()}
            />
            <Button onClick={handleAddBank} disabled={createBank.isPending}>Add</Button>
          </div>
          
          <div className="flex-1 overflow-y-auto border rounded-md divide-y">
            {banks?.map(bank => (
              <div key={bank.id} className="flex justify-between items-center p-3 text-sm hover:bg-slate-50">
                <span className="font-medium">{bank.name}</span>
                {!bank.isDefault && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteBank(bank.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {bank.isDefault && (
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
    </div>
  );
}
