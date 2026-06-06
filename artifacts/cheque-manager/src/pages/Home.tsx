import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { 
  useCreateChequeEntry, 
  useListBanks, 
  getListBanksQueryKey,
  getLookupPartyQueryOptions
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  entryDate: z.string(),
  chequeDay: z.string().regex(/^\d{1,2}$/, "Must be 1-2 digits").refine(val => {
    const num = parseInt(val, 10);
    return num >= 1 && num <= 31;
  }, "Invalid day"),
  bills: z.array(z.object({
    billNo: z.string().min(1, "Required")
  })).min(1, "At least one bill is required"),
  partyName: z.string().min(1, "Required"),
  chequeAmount: z.number().min(1, "Must be > 0"),
  chequeNo: z.string().min(1, "Required"),
  bankName: z.string().min(1, "Required")
});

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createEntry = useCreateChequeEntry();
  const { data: banks } = useListBanks({ query: { queryKey: getListBanksQueryKey() } });
  
  const [duplicateWarning, setDuplicateWarning] = useState<{
    open: boolean;
    data: any;
    duplicateInfo?: any;
  }>({ open: false, data: null });

  const [bankOpen, setBankOpen] = useState(false);
  const firstBillRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      entryDate: format(new Date(), "yyyy-MM-dd"),
      chequeDay: format(new Date(), "dd"),
      bills: [{ billNo: "" }],
      partyName: "",
      chequeAmount: 0,
      chequeNo: "",
      bankName: ""
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "bills"
  });

  const currentMonthYear = format(new Date(), "MMMM yyyy");

  const performLookup = async (billNo: string) => {
    if (!billNo) return;
    try {
      const data = await queryClient.fetchQuery(getLookupPartyQueryOptions({ billNo }));
      if (data?.partyName && !form.getValues().partyName) {
        form.setValue("partyName", data.partyName);
      }
      if (data?.chequeNo && !form.getValues().chequeNo) {
        form.setValue("chequeNo", data.chequeNo);
      }
    } catch (err) {
      // silent fail for lookup
    }
  };

  const handleSave = (values: z.infer<typeof formSchema>, force = false) => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(values.chequeDay).padStart(2, '0');
    
    createEntry.mutate({
      data: {
        entryDate: values.entryDate,
        chequeDate: `${year}-${month}-${day}`,
        billNos: values.bills.map(b => b.billNo),
        partyName: values.partyName,
        chequeAmount: values.chequeAmount,
        chequeNo: values.chequeNo,
        bankName: values.bankName
      }
    }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Cheque entry saved." });
        form.reset({
          ...form.getValues(),
          bills: [{ billNo: "" }],
          partyName: "",
          chequeAmount: 0,
          chequeNo: "",
          bankName: ""
        });
        setDuplicateWarning({ open: false, data: null });
        setTimeout(() => firstBillRef.current?.focus(), 100);
      },
      onError: (error: any) => {
        if (!force && error?.status === 409) {
          setDuplicateWarning({
            open: true,
            data: values,
            duplicateInfo: error?.body?.duplicate
          });
        } else {
          toast({ variant: "destructive", title: "Error", description: "Failed to save entry" });
        }
      }
    });
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => handleSave(values, false);

  const formatAmount = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
  };

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <Card className="border-t-4 border-t-primary shadow-xl">
        <CardHeader className="bg-primary/5 pb-6 border-b">
          <CardTitle className="text-2xl font-bold text-primary flex items-center gap-2">
            Cheque Entry
          </CardTitle>
          <CardDescription className="text-base">Fast data entry for incoming cheques.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="entryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold">Entry Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} className="h-12 bg-white" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="chequeDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold flex justify-between">
                        <span>Cheque Date</span>
                        <span className="text-muted-foreground text-xs">{currentMonthYear}</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            type="text" 
                            placeholder="DD" 
                            maxLength={2} 
                            {...field} 
                            className="h-12 text-center text-lg font-bold tracking-widest bg-white" 
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-3 p-5 bg-slate-50 border rounded-lg">
                <Label className="font-semibold text-base">Bill Numbers</Label>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2">
                    <FormField
                      control={form.control}
                      name={`bills.${index}.billNo`}
                      render={({ field: inputField }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input 
                              placeholder="Enter Bill No" 
                              {...inputField} 
                              className="h-12 bg-white" 
                              onBlur={(e) => {
                                inputField.onBlur();
                                performLookup(e.target.value);
                              }}
                              ref={index === 0 ? firstBillRef : null}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {fields.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-12 w-12 text-destructive hover:bg-destructive/10" onClick={() => remove(index)}>
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={() => append({ billNo: "" })} className="w-full border-dashed bg-white">
                  <Plus className="h-4 w-4 mr-2" /> Add Bill
                </Button>
              </div>

              <FormField
                control={form.control}
                name="partyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Party Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Auto-filled or type manually" {...field} className="h-12 bg-white font-medium" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="chequeAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold">Amount (₹)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          className="h-12 text-lg font-bold text-primary bg-white" 
                          {...field} 
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground text-right">{formatAmount(field.value)}</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="chequeNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold">Cheque No</FormLabel>
                      <FormControl>
                        <Input placeholder="000000" {...field} className="h-12 font-mono tracking-widest bg-white" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="font-semibold">Bank Name</FormLabel>
                    <Popover open={bankOpen} onOpenChange={setBankOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn("w-full h-12 justify-between bg-white", !field.value && "text-muted-foreground")}
                          >
                            {field.value || "Select or type bank"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search bank..." />
                          <CommandList>
                            <CommandEmpty>No bank found.</CommandEmpty>
                            <CommandGroup>
                              {banks?.map((bank) => (
                                <CommandItem
                                  value={bank.name}
                                  key={bank.id}
                                  onSelect={() => {
                                    form.setValue("bankName", bank.name);
                                    setBankOpen(false);
                                  }}
                                >
                                  {bank.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-2xl sm:sticky sm:bottom-0 sm:bg-transparent sm:border-0 sm:shadow-none sm:p-0 mt-8 z-50">
                <div className="flex gap-4 max-w-2xl mx-auto">
                  <Button type="button" variant="outline" className="h-14 w-1/3 text-base bg-white" onClick={() => form.reset()}>
                    Clear
                  </Button>
                  <Button 
                    type="submit" 
                    className="h-14 w-2/3 bg-accent hover:bg-accent/90 text-accent-foreground text-lg font-bold shadow-lg"
                    disabled={createEntry.isPending}
                  >
                    {createEntry.isPending ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
                    Save Entry
                  </Button>
                </div>
              </div>

            </form>
          </Form>
        </CardContent>
      </Card>

      <AlertDialog open={duplicateWarning.open} onOpenChange={(open) => !open && setDuplicateWarning({ open: false, data: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center text-amber-600 gap-2">
              <AlertTriangle className="h-5 w-5" />
              Possible Duplicate Cheque Detected
            </AlertDialogTitle>
            <AlertDialogDescription>
              A cheque with this number and bank already exists for this party.
              <br/><br/>
              <strong>Existing Entry:</strong><br/>
              Date: {duplicateWarning.duplicateInfo?.entryDate}<br/>
              Amount: ₹{duplicateWarning.duplicateInfo?.chequeAmount}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => handleSave(duplicateWarning.data, true)}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Save Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
