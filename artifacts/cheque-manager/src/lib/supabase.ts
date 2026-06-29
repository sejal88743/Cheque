import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://sgtjihrzpngktwnpihmx.supabase.co';

const supabaseKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNndGppaHJ6cG5na3R3bnBpaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTczMzMsImV4cCI6MjA5NDkzMzMzM30.ZOE8BJbLMuS72k2OzOKlV-sD34Fy8punld3pJzV9dv8';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

export interface SupaBill {
  id: number;
  sr_no: string | null;
  date: string | null;
  salesperson_name: string | null;
  collection_code: string | null;
  bill_no: string | null;
  party_code: string | null;
  party_hul_code: string | null;
  party_name: string | null;
  beat_name: string | null;
  bill_net_amt: number | null;
  collected_amount: number | null;
  outstanding_amount: number | null;
  bill_ageing: number | null;
  payment_mode: string | null;
  payment_date: string | null;
  payment_time: string | null;
  driver_name: string | null;
  delivery_date: string | null;
  cheque_no: string | null;
  cheque_date: string | null;
  bank_name: string | null;
  next_bill_no: string | null;
  cancel_line: string | null;
  discrepancy_reason: string | null;
  cash_amount: number | null;
  upi_amount: number | null;
  cheque_amount: number | null;
  updated_at: string | null;
  line_cut_amt: number | null;
  payment_method: string | null;
}

export async function lookupBillFromSupabase(input: string): Promise<SupaBill | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const { data: exact } = await supabase
    .from('bills')
    .select('*')
    .eq('bill_no', trimmed)
    .maybeSingle();
  if (exact) return exact;

  const { data: rows } = await supabase
    .from('bills')
    .select('*')
    .ilike('bill_no', `%${trimmed}`)
    .limit(1);
  return rows?.[0] ?? null;
}

async function resolveBillNo(billNo: string): Promise<string> {
  // Try exact match first
  const { data: exact } = await supabase
    .from('bills')
    .select('bill_no')
    .eq('bill_no', billNo)
    .limit(1);
  if (exact && exact.length > 0) return billNo;
  // Fallback: suffix ilike match (e.g. "7909" matches "GST7909")
  const { data: suffix } = await supabase
    .from('bills')
    .select('bill_no')
    .ilike('bill_no', `%${billNo}`)
    .limit(1);
  return suffix?.[0]?.bill_no ?? billNo;
}

export async function updateBillInSupabase(
  billNo: string,
  updates: {
    cheque_date?: string;
    bank_name?: string;
    cheque_no?: string;
    cheque_amount?: number;
    collected_amount?: number;
    next_bill_no?: string | null;
    payment_date?: string | null;
  }
): Promise<void> {
  const resolvedBillNo = await resolveBillNo(billNo);
  const { error } = await supabase
    .from('bills')
    .update(updates)
    .eq('bill_no', resolvedBillNo);
  if (error) throw error;
}

export async function batchLookupOutstandingAmounts(billNos: string[]): Promise<Map<string, number>> {
  if (billNos.length === 0) return new Map();

  const map = new Map<string, number>();

  // Step 1: Exact match
  const { data: exactData } = await supabase
    .from('bills')
    .select('bill_no, outstanding_amount')
    .in('bill_no', billNos);

  const foundExact = new Set<string>();
  for (const row of exactData ?? []) {
    if (row.bill_no != null) {
      map.set(String(row.bill_no), row.outstanding_amount ?? 0);
      foundExact.add(String(row.bill_no));
    }
  }

  // Step 2: Suffix ilike match for bills not found by exact match
  // Handles cases like XLS has "7909" but Supabase has "GST7909"
  const unfound = billNos.filter(b => !foundExact.has(b));
  if (unfound.length > 0) {
    const orFilter = unfound.map(b => `bill_no.ilike.%${b}`).join(',');
    const { data: suffixData } = await supabase
      .from('bills')
      .select('bill_no, outstanding_amount')
      .or(orFilter);

    for (const row of suffixData ?? []) {
      if (row.bill_no != null) {
        const origBillNo = unfound.find(b =>
          String(row.bill_no).endsWith(b) || String(row.bill_no) === b
        );
        if (origBillNo && !map.has(origBillNo)) {
          map.set(origBillNo, row.outstanding_amount ?? 0);
        }
      }
    }
  }

  return map;
}

export async function lookupLinkedBillsByChequNo(chequeNo: string, bankName: string): Promise<SupaBill[]> {
  if (!chequeNo) return [];
  const { data } = await supabase
    .from('bills')
    .select('*')
    .eq('cheque_no', chequeNo)
    .ilike('bank_name', bankName)
    .order('bill_no', { ascending: true });
  return data ?? [];
}

export async function updateBillFromImport(
  billNo: string,
  data: {
    cheque_date: string;
    bank_name: string;
    cheque_no: string;
    cheque_amount: number;
    collected_amount: number;
    payment_mode: string;
    payment_date: string;
  }
): Promise<void> {
  const resolvedBillNo = await resolveBillNo(billNo);
  const { error } = await supabase
    .from('bills')
    .update({ ...data, outstanding_amount: 0 })
    .eq('bill_no', resolvedBillNo);
  if (error) console.warn('Supabase bill update warning:', billNo, error.message);
}
