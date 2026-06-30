export interface ParsedImportEntry {
  chequeDate: string;
  entryDate: string;
  partyName: string;
  billNos: string[];
  chequeAmount: number;
  chequeNo: string;
  bankName: string;
  sheetName: string;
}

export interface SheetSummary {
  name: string;
  date: string;
  count: number;
}

export interface ImportPreview {
  entries: ParsedImportEntry[];
  sheetSummary: SheetSummary[];
  banksFound: string[];
}

export function parseBillNos(raw: string | number): string[] {
  if (raw === '' || raw === null || raw === undefined) return [];
  const str = String(raw).trim();
  if (!str) return [];

  // Remove credit note references like "CN 241" or "CN241"
  const withoutCN = str.replace(/CN\s*\d+/gi, ' ');

  // Split on any separator: space, comma, hyphen, slash, plus
  const parts = withoutCN.split(/[\s,+\-\/]+/);
  const result: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    // Only pure numeric parts are valid bill numbers — pad to 5 digits
    if (trimmed && /^\d+$/.test(trimmed)) result.push(trimmed.padStart(5, '0'));
  }

  return [...new Set(result)];
}

export function excelSerialToDate(serial: number): string {
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function sheetNameToDate(name: string, dateCellValue?: unknown): string {
  if (typeof dateCellValue === 'number' && dateCellValue > 40000) {
    return excelSerialToDate(dateCellValue);
  }

  if (typeof dateCellValue === 'string' && dateCellValue.includes('/')) {
    const parts = dateCellValue.split('/');
    if (parts.length === 3) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${y}-${m}-${d}`;
    }
  }

  const normalized = name.trim().toUpperCase().replace(/\s+/g, '');
  const monthMap: Record<string, string> = {
    JAN: '01', JANUARY: '01', FEB: '02', FEBRUARY: '02',
    MAR: '03', MARCH: '03', APR: '04', APRIL: '04',
    MAY: '05', JUN: '06', JUNE: '06', JUL: '07', JULY: '07',
    AUG: '08', AUGUST: '08', SEP: '09', SEPTEMBER: '09',
    OCT: '10', OCTOBER: '10', NOV: '11', NOVEMBER: '11',
    DEC: '12', DECEMBER: '12',
  };

  for (const [monthStr, monthNum] of Object.entries(monthMap)) {
    const match = normalized.match(new RegExp(`^(\\d{1,2})${monthStr}$`));
    if (match) {
      const day = match[1].padStart(2, '0');
      const year = new Date().getFullYear();
      return `${year}-${monthNum}-${day}`;
    }
  }

  const dayOnly = normalized.match(/^(\d{1,2})$/);
  if (dayOnly) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = dayOnly[1].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return '';
}

function findTableHeaders(rows: unknown[][]): Array<{
  snCol: number; amtCol: number; bankCol: number;
  chqCol: number; billCol: number; partyCol: number; dateCol: number;
}> {
  const tables: ReturnType<typeof findTableHeaders> = [];
  const seenCols = new Set<number>();

  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] as unknown[];
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? '').trim().toUpperCase();
      if (cell === 'S.NO' && !seenCols.has(c)) {
        const nextHeader = String(row[c + 1] ?? '').trim().toUpperCase();
        if (nextHeader.includes('AMOUNT') || nextHeader.includes('AMT')) {
          seenCols.add(c);

          // Scan remaining headers to detect column positions by name
          let bankCol = -1, chqCol = -1, billCol = -1, partyCol = -1, dateCol = -1;
          for (let dc = c + 2; dc < Math.min(row.length, c + 14); dc++) {
            const hdr = String(row[dc] ?? '').trim().toUpperCase().replace(/[\s.]+/g, '');
            if (bankCol < 0 && (hdr.includes('BANK') || hdr === 'BNK')) bankCol = dc;
            else if (chqCol < 0 && (hdr.includes('CHQ') || hdr.includes('CHEQ') || hdr === 'CHEQUENO' || hdr === 'CHQNO')) chqCol = dc;
            else if (billCol < 0 && (hdr.includes('BILL') || hdr === 'BILLNO')) billCol = dc;
            else if (partyCol < 0 && (hdr.includes('PARTY') || hdr.includes('NAME'))) partyCol = dc;
            if (dateCol < 0 && (hdr.includes('DATE') || hdr === 'CHQDATE' || hdr === 'CHEQDATE')) dateCol = dc;
          }

          // Fallback to fixed offsets if header detection misses a column
          if (bankCol < 0) bankCol = c + 2;
          if (chqCol < 0 && billCol < 0) { chqCol = c + 3; billCol = c + 4; }
          else if (chqCol < 0) chqCol = billCol === c + 3 ? c + 4 : c + 3;
          else if (billCol < 0) billCol = chqCol === c + 3 ? c + 4 : c + 3;
          if (partyCol < 0) partyCol = c + 5;

          tables.push({ snCol: c, amtCol: c + 1, bankCol, chqCol, billCol, partyCol, dateCol });
        }
      }
    }
  }

  return tables;
}

function parseSheetRows(rows: unknown[][], sheetName: string): ParsedImportEntry[] {
  // Sheet-level date fallback: look at row 3 col 5, then sheet name
  const dateCellValue = (rows[3] as unknown[])?.[5];
  const sheetLevelDate = sheetNameToDate(sheetName, dateCellValue);

  const tables = findTableHeaders(rows);
  if (tables.length === 0) return [];

  const entries: ParsedImportEntry[] = [];

  for (const { snCol, amtCol, bankCol, chqCol, billCol, partyCol, dateCol } of tables) {
    for (const row of rows) {
      const r = row as unknown[];
      const sno = r[snCol];
      if (typeof sno !== 'number' || sno <= 0 || !Number.isInteger(sno)) continue;

      const amount = r[amtCol];
      if (typeof amount !== 'number' || amount <= 0) continue;

      const bankName = String(r[bankCol] ?? '').trim();
      const chequeNo = String(r[chqCol] ?? '').trim();
      const billNoRaw = r[billCol];
      const partyName = String(r[partyCol] ?? '').trim();

      if (!bankName || !partyName) continue;

      const billNos = parseBillNos(billNoRaw as string | number);
      if (billNos.length === 0) continue;

      // Per-row cheque date (column 7 / "cheq date") — overrides sheet-level date
      let rowDate = sheetLevelDate;
      if (dateCol >= 0) {
        const rawDate = r[dateCol];
        if (typeof rawDate === 'number' && rawDate > 40000) {
          rowDate = excelSerialToDate(rawDate);
        } else if (typeof rawDate === 'string' && rawDate.trim()) {
          const parsed = sheetNameToDate(rawDate.trim(), undefined);
          if (parsed) rowDate = parsed;
        }
      }
      if (!rowDate) continue;

      entries.push({
        chequeDate: rowDate,
        entryDate: rowDate,
        partyName,
        billNos,
        chequeAmount: amount,
        chequeNo: chequeNo || '0',
        bankName: bankName.toUpperCase(),
        sheetName,
      });
    }
  }

  return entries;
}

export async function parseXLSForImport(file: File): Promise<ImportPreview> {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  const allEntries: ParsedImportEntry[] = [];
  const sheetSummary: SheetSummary[] = [];
  const banksSet = new Set<string>();

  for (const sheetName of wb.SheetNames) {
    const ws = (wb.Sheets as Record<string, unknown>)[sheetName];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][];
    const dateCellValue = (rows[3] as unknown[])?.[5];
    const date = sheetNameToDate(sheetName, dateCellValue);

    const entries = parseSheetRows(rows, sheetName);
    for (const e of entries) banksSet.add(e.bankName);
    sheetSummary.push({ name: sheetName, date, count: entries.length });
    allEntries.push(...entries);
  }

  return {
    entries: allEntries,
    sheetSummary,
    banksFound: [...banksSet].sort(),
  };
}
