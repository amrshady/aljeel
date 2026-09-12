import ExcelJS from 'exceljs';
import type { SupplierReconMatchRow, SupplierReconResult } from './supplier-reconciliation';

export const COMPANY_NAME = 'aljeel Medical & Trading Co.';

const ACCOUNTING = '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)';
const MONEY = '#,##0.00';
const DATE_FMT = 'mm-dd-yy';

function themeColor(theme: number, tint?: number): ExcelJS.Color {
  return { theme, tint } as unknown as ExcelJS.Color;
}

const BORDER_COLOR = themeColor(0, -0.249977111117893);

const headerFill: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: themeColor(3, -0.249977111117893),
};
const netPayFill: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: themeColor(0, -0.0499893185216834),
};
const addBannerFill: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: themeColor(4, 0.5999938962981048),
};
const addBarFill: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: themeColor(4, -0.499984740745262),
};
const sumFill: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: themeColor(3, 0.7999816888943144),
};
const adjustedFill: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: themeColor(5, 0.7999816888943144),
};
const blackBarFill: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: themeColor(1),
};
const mismatchFill: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF2CC' },
};
const notFoundFill: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFCE4D6' },
};

const thin = (sides: Array<'top' | 'left' | 'bottom' | 'right'> = ['top', 'left', 'bottom', 'right']): Partial<ExcelJS.Borders> => {
  const border: Partial<ExcelJS.Borders> = {};
  for (const side of sides) {
    border[side] = { style: 'thin', color: BORDER_COLOR };
  }
  return border;
};

const hair = (sides: Array<'top' | 'left' | 'bottom' | 'right'> = ['top', 'left', 'bottom', 'right']): Partial<ExcelJS.Borders> => {
  const border: Partial<ExcelJS.Borders> = {};
  for (const side of sides) {
    border[side] = { style: 'hair', color: { argb: 'FF000000' } };
  }
  return border;
};

function style(
  cell: ExcelJS.Cell,
  options: {
    font?: Partial<ExcelJS.Font>;
    fill?: ExcelJS.Fill;
    alignment?: Partial<ExcelJS.Alignment>;
    border?: Partial<ExcelJS.Borders>;
    numFmt?: string;
  },
) {
  if (options.font) cell.font = options.font;
  if (options.fill) cell.fill = options.fill;
  if (options.alignment) cell.alignment = options.alignment;
  if (options.border) cell.border = options.border;
  if (options.numFmt) cell.numFmt = options.numFmt;
}

function paint(ws: ExcelJS.Worksheet, row: number, cols: number[], applyStyle: (cell: ExcelJS.Cell) => void) {
  for (const col of cols) applyStyle(ws.getCell(row, col));
}

function asDate(value: string | null): Date | string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function statusLabel(status: SupplierReconMatchRow['status']): string {
  switch (status) {
    case 'FOUND':
      return 'Found';
    case 'NOT_IN_ALJEEL':
      return 'Not found';
    case 'NOT_IN_SUPPLIER':
      return 'Not in supplier books';
    case 'AMOUNT_MISMATCH':
      return 'Amount mismatch';
  }
}

export async function buildSupplierReconWorkbook(result: SupplierReconResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Aljeel AP';
  addMatchSheet(workbook, result);
  addPaymentSheet(workbook, result);
  addReconSheet(workbook, result);
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}

function pinOrigin(ws: ExcelJS.Worksheet) {
  ws.getCell(1, 1).value = '';
}

function addMatchSheet(workbook: ExcelJS.Workbook, result: SupplierReconResult) {
  const ws = workbook.addWorksheet('Match');
  ws.columns = [
    { width: 22 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 22 },
    { width: 42 },
  ];
  const headers = [
    'Invoice Number',
    'Date',
    'Supplier Amount',
    'Aljeel Amount',
    'Unpaid Amount',
    'Status',
    'Notes',
  ];
  headers.forEach((header, index) => {
    const cell = ws.getCell(1, index + 1);
    cell.value = header;
    style(cell, {
      font: { name: 'Century Gothic', size: 10, bold: true, color: { theme: 0 } },
      fill: headerFill,
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thin(),
    });
  });
  ws.getRow(1).height = 22;

  result.matches.forEach((row, index) => {
    const r = index + 2;
    const values: ExcelJS.CellValue[] = [
      row.invoiceNumber,
      asDate(row.date),
      row.supplierAmount,
      row.aljeelAmount,
      row.unpaidAmount,
      statusLabel(row.status),
      row.notes,
    ];
    values.forEach((value, col) => {
      const cell = ws.getCell(r, col + 1);
      cell.value = value ?? null;
      style(cell, {
        font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FF333333' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thin(),
      });
    });
    ws.getCell(r, 2).numFmt = DATE_FMT;
    ws.getCell(r, 3).numFmt = MONEY;
    ws.getCell(r, 4).numFmt = MONEY;
    ws.getCell(r, 5).numFmt = MONEY;
    ws.getCell(r, 7).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    if (row.status === 'AMOUNT_MISMATCH') paint(ws, r, [1, 2, 3, 4, 5, 6, 7], (cell) => {
      cell.fill = mismatchFill;
    });
    if (row.status === 'NOT_IN_ALJEEL') paint(ws, r, [1, 2, 3, 4, 5, 6, 7], (cell) => {
      cell.fill = notFoundFill;
    });
  });
}

function addPaymentSheet(workbook: ExcelJS.Workbook, result: SupplierReconResult) {
  const ws = workbook.addWorksheet('Payment details');
  pinOrigin(ws);
  ws.columns = [
    { width: 3.8 },
    { width: 16.6 },
    { width: 19.9 },
    { width: 18.2 },
    { width: 16.1 },
    { width: 17.4 },
  ];
  ws.pageSetup.paperSize = 9;
  ws.pageSetup.orientation = 'portrait';
  ws.pageSetup.scale = 84;

  const titleFont: Partial<ExcelJS.Font> = {
    name: 'Aptos Narrow',
    size: 14,
    bold: true,
    color: { theme: 1 },
  };
  const titleAlign: Partial<ExcelJS.Alignment> = {
    horizontal: 'centerContinuous',
    vertical: 'middle',
  };
  paint(ws, 2, [2, 3, 4, 5, 6], (cell) => {
    style(cell, { font: titleFont, alignment: titleAlign, numFmt: DATE_FMT });
  });
  ws.getCell(2, 2).value = COMPANY_NAME;
  ws.getRow(2).height = 24;

  paint(ws, 3, [2, 3, 4, 5, 6], (cell) => {
    style(cell, { font: titleFont, alignment: titleAlign, numFmt: DATE_FMT });
  });
  ws.getCell(3, 2).value = asDate(result.asOfDate);
  ws.getRow(3).height = 24;

  const bannerFont: Partial<ExcelJS.Font> = {
    name: 'Century Gothic',
    size: 10,
    bold: true,
    color: { theme: 0 },
  };
  paint(ws, 4, [2, 3, 4, 5, 6], (cell) => {
    style(cell, {
      font: bannerFont,
      fill: headerFill,
      alignment: { horizontal: 'centerContinuous', vertical: 'middle', wrapText: true },
      border: thin(['left', 'right', 'top']),
    });
  });
  ws.getCell(4, 2).value = 'Payment details sheet';
  ws.getRow(4).height = 14.4;

  const metaFont: Partial<ExcelJS.Font> = {
    name: 'Century Gothic',
    size: 11,
    bold: true,
    color: { theme: 1 },
  };
  ws.getCell(6, 2).value = `Supplier Name:${result.supplierName ?? ''}`;
  style(ws.getCell(6, 2), {
    font: metaFont,
    alignment: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });
  ws.getRow(6).height = 15.6;
  ws.getCell(7, 2).value = `Currency: ${result.currency}`;
  style(ws.getCell(7, 2), {
    font: metaFont,
    alignment: { horizontal: 'left', vertical: 'middle', indent: 1 },
  });
  ws.getRow(7).height = 15.6;

  paint(ws, 9, [2, 3, 4, 5, 6], (cell) => {
    style(cell, {
      font: bannerFont,
      fill: headerFill,
      alignment: { horizontal: 'centerContinuous', vertical: 'middle', wrapText: true },
      border: thin(['left', 'right', 'top']),
    });
  });
  ws.getCell(9, 2).value = 'Payment Status';

  const tableHeaders = ['Doc.no', 'Amount', 'Invoice No', 'Status', 'Date'];
  tableHeaders.forEach((header, index) => {
    const cell = ws.getCell(10, index + 2);
    cell.value = header;
    style(cell, {
      font: bannerFont,
      fill: headerFill,
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thin(),
    });
  });
  ws.getCell(10, 6).font = { name: 'Century Gothic', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };

  let row = 11;
  if (result.prepaymentBlocked) {
    ws.getCell(row, 2).value = 'PREPAYMENT HOLD';
    ws.getCell(row, 3).value = result.prepaymentAvailable;
    ws.getCell(row, 4).value = 'Open prepayment — do not issue a new payment until it is settled.';
    paint(ws, row, [2, 3, 4, 5, 6], (cell) => {
      style(cell, {
        font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FF333333' } },
        fill: mismatchFill,
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
        border: thin(),
      });
    });
    ws.getCell(row, 3).numFmt = MONEY;
    row += 1;
  }

  for (const item of result.paymentRequest) {
    ws.getCell(row, 3).value = item.unpaidAmount;
    ws.getCell(row, 4).value = item.invoiceNumber;
    ws.getCell(row, 5).value = 'Booked';
    ws.getCell(row, 6).value = asDate(item.date);
    paint(ws, row, [2, 3, 4, 5, 6], (cell) => {
      style(cell, {
        font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FF333333' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: thin(),
      });
    });
    ws.getCell(row, 2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFFFF' },
    };
    ws.getCell(row, 3).numFmt = MONEY;
    ws.getCell(row, 6).numFmt = DATE_FMT;
    ws.getCell(row, 6).font = { name: 'Century Gothic', size: 10, bold: false };
    row += 1;
  }

  const netAmount = result.paymentRequest.reduce((sum, item) => sum + (item.unpaidAmount ?? 0), 0);
  paint(ws, row, [2, 3, 4, 5, 6], (cell) => {
    style(cell, {
      font: { name: 'Century Gothic', size: 10, bold: true, color: { theme: 1 } },
      fill: netPayFill,
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: thin(),
    });
  });
  ws.getCell(row, 2).value = 'Net To Pay';
  ws.getCell(row, 3).value = Number(netAmount.toFixed(2));
  ws.getCell(row, 3).numFmt = MONEY;
  ws.getCell(row, 3).font = { name: 'Century Gothic', size: 11, bold: true, color: { theme: 1 } };
  ws.getCell(row, 5).value = result.prepaymentBlocked ? 'HOLD' : 'Current Payment';
  ws.getRow(row).height = 25.2;

  const signFont: Partial<ExcelJS.Font> = {
    name: 'Aptos Narrow',
    size: 9,
    bold: true,
    color: { theme: 1 },
  };
  const nameFont: Partial<ExcelJS.Font> = {
    name: 'Aptos Narrow',
    size: 11,
    bold: true,
    color: { theme: 1 },
  };
  row += 2;
  ws.getCell(row, 2).value = 'PREPARED BY:';
  style(ws.getCell(row, 2), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
  row += 1;
  ws.getCell(row, 2).value = 'NAME:';
  ws.getCell(row, 5).value = 'NAME:';
  style(ws.getCell(row, 2), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
  style(ws.getCell(row, 5), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
  row += 1;
  ws.getCell(row, 3).value = 'Accountant';
  ws.getCell(row, 6).value = 'AP Supervisor';
  style(ws.getCell(row, 3), { font: nameFont });
  style(ws.getCell(row, 6), { font: nameFont });
  row += 1;
  ws.getCell(row, 2).value = 'SIGNATURE';
  ws.getCell(row, 5).value = 'SIGNATURE';
  style(ws.getCell(row, 2), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
  style(ws.getCell(row, 5), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
  row += 2;
  ws.getCell(row, 2).value = 'APPROVED BY:';
  style(ws.getCell(row, 2), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
  row += 1;
  ws.getCell(row, 2).value = 'NAME:';
  style(ws.getCell(row, 2), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
  row += 1;
  ws.getCell(row, 3).value = 'Chief Accountant';
  style(ws.getCell(row, 3), { font: nameFont });
  row += 1;
  ws.getCell(row, 2).value = 'SIGNATURE';
  style(ws.getCell(row, 2), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
}

function addReconSheet(workbook: ExcelJS.Workbook, result: SupplierReconResult) {
  const ws = workbook.addWorksheet('Reconciliation');
  pinOrigin(ws);
  ws.columns = [
    { width: 4.4 },
    { width: 29.4 },
    { width: 21.6 },
    { width: 16.4 },
    { width: 25.8 },
    { width: 25.2 },
    { width: 30.8 },
  ];
  ws.pageSetup.paperSize = 9;
  ws.pageSetup.orientation = 'portrait';
  ws.pageSetup.scale = 56;

  const titleFont: Partial<ExcelJS.Font> = {
    name: 'Aptos Narrow',
    size: 14,
    bold: true,
    color: { theme: 1 },
  };
  paint(ws, 2, [2, 3, 4, 5, 6, 7], (cell) => {
    style(cell, {
      font: titleFont,
      alignment: { horizontal: 'centerContinuous', vertical: 'middle' },
      numFmt: DATE_FMT,
    });
  });
  ws.getCell(2, 2).value = COMPANY_NAME;
  ws.getRow(2).height = 18;

  paint(ws, 3, [2, 3, 4, 5, 6, 7], (cell) => {
    style(cell, {
      font: titleFont,
      alignment: { horizontal: 'centerContinuous', vertical: 'middle' },
      numFmt: DATE_FMT,
    });
  });
  ws.getCell(3, 2).value = asDate(result.asOfDate);
  ws.getRow(3).height = 18;

  paint(ws, 4, [2, 3, 4, 5, 6, 7], (cell) => {
    style(cell, {
      font: { name: 'Aptos Narrow', size: 11, color: { theme: 1 } },
      fill: blackBarFill,
    });
  });

  const labelFont: Partial<ExcelJS.Font> = {
    name: 'Aptos Narrow',
    size: 9,
    bold: true,
    color: { theme: 1 },
  };
  const underline = { bottom: { style: 'thin' as const, color: { argb: 'FF000000' } } };

  ws.getCell(5, 2).value = 'Supplier Name';
  ws.getCell(5, 3).value = result.supplierName;
  ws.getCell(5, 6).value = 'BALANCE PER BOOKS';
  ws.getCell(5, 7).value = result.booksBalance;
  style(ws.getCell(5, 2), { font: labelFont });
  style(ws.getCell(5, 3), {
    font: labelFont,
    alignment: { horizontal: 'center' },
    border: underline,
    numFmt: DATE_FMT,
  });
  style(ws.getCell(5, 6), { font: labelFont, alignment: { horizontal: 'left' } });
  style(ws.getCell(5, 7), {
    font: labelFont,
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: underline,
    numFmt: ACCOUNTING,
  });

  ws.getCell(6, 2).value = 'Supplier Number';
  ws.getCell(6, 6).value = 'BALANCE PER SUPPLIERS BOOKS';
  ws.getCell(6, 7).value = result.supplierBalance;
  style(ws.getCell(6, 2), { font: labelFont });
  style(ws.getCell(6, 3), {
    font: labelFont,
    alignment: { horizontal: 'center' },
    border: underline,
    numFmt: '0',
  });
  style(ws.getCell(6, 6), { font: labelFont, alignment: { horizontal: 'left' } });
  style(ws.getCell(6, 7), {
    font: labelFont,
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: underline,
    numFmt: ACCOUNTING,
  });

  ws.getCell(7, 2).value = 'Facility';
  ws.getCell(7, 6).value = 'Currency';
  ws.getCell(7, 7).value = result.currency;
  style(ws.getCell(7, 2), { font: labelFont });
  style(ws.getCell(7, 3), { font: labelFont, alignment: { horizontal: 'center' }, border: underline });
  style(ws.getCell(7, 6), { font: labelFont, alignment: { horizontal: 'left' } });
  style(ws.getCell(7, 7), {
    font: labelFont,
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: underline,
  });

  paint(ws, 9, [2, 3, 4, 5, 6, 7], (cell) => {
    style(cell, {
      font: { name: 'Aptos Narrow', size: 11, bold: true, color: { theme: 0 } },
      fill: addBarFill,
    });
  });

  let row = 10;
  row = writeBanner(ws, row, 'Add');
  row = writeReconSection(
    ws,
    row,
    'Transactions not showing in the Supplier book          (Add into our book balance)',
    [],
    0,
  );
  row += 1;
  row = writeBanner(ws, row, null);
  row = writeReconSection(
    ws,
    row,
    'Transactions not booked in Aljeel books                       (Add into our book balance)',
    result.notBookedInAljeel.map((item) => ({
      date: item.date,
      invoiceNumber: item.invoiceNumber,
      amount: item.supplierAmount,
      notes: item.notes,
    })),
    result.addNotBookedTotal,
  );
  row += 1;
  row = writeBanner(ws, row, 'Deduct');
  row = writeReconSection(
    ws,
    row,
    'Transactions not showing in the Supplier book (Deduct into our book balance)',
    result.notInSupplierBooks.map((item) => ({
      date: item.date,
      invoiceNumber: item.invoiceNumber,
      amount: item.unpaidAmount,
      notes: item.notes,
    })),
    result.deductNotInSupplierTotal,
  );
  row += 1;
  row = writeReconSection(
    ws,
    row,
    'Transactions not booked in Aljeel books            (Deduct into our book balance)',
    [],
    0,
  );

  if (result.amountMismatches.length > 0) {
    row += 1;
    row = writeReconSection(
      ws,
      row,
      'Amount mismatches (same invoice number, different amount — highlight and follow up)',
      result.amountMismatches.map((item) => ({
        date: item.date,
        invoiceNumber: item.invoiceNumber,
        amount: null,
        notes: `${item.aljeelAmount} / ${item.supplierAmount}${item.notes ? ` — ${item.notes}` : ''}`,
        highlight: true,
      })),
      null,
    );
  }

  if (result.prepaymentBlocked) {
    row += 1;
    ws.getCell(row, 2).value = 'Open prepayment — company policy: do not issue a new payment until settled';
    ws.getCell(row, 6).value = result.prepaymentAvailable;
    style(ws.getCell(row, 2), {
      font: { name: 'Aptos Narrow', size: 9, bold: true, color: { theme: 1 } },
      fill: mismatchFill,
      alignment: { horizontal: 'left', vertical: 'middle', wrapText: true },
    });
    style(ws.getCell(row, 6), {
      font: labelFont,
      fill: mismatchFill,
      numFmt: ACCOUNTING,
    });
  }

  row += 1;
  writeAdjustedRow(ws, row, 'Books Adjusted Balance', result.adjustedBalance);
  row += 1;
  writeAdjustedRow(ws, row, 'Differences In Begning Balance', result.beginningDifference);

  const signFont: Partial<ExcelJS.Font> = {
    name: 'Aptos Narrow',
    size: 9,
    bold: true,
    color: { theme: 1 },
  };
  row += 2;
  ws.getCell(row, 2).value = 'PREPARED BY:';
  ws.getCell(row, 5).value = 'APPROVED BY:';
  style(ws.getCell(row, 2), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
  style(ws.getCell(row, 5), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
  row += 1;
  ws.getCell(row, 2).value = 'NAME:';
  ws.getCell(row, 5).value = 'NAME:';
  style(ws.getCell(row, 2), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
  style(ws.getCell(row, 5), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
  row += 1;
  ws.getCell(row, 2).value = 'POSITION:';
  ws.getCell(row, 5).value = 'POSITION:';
  style(ws.getCell(row, 2), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
  style(ws.getCell(row, 5), { font: signFont, alignment: { horizontal: 'left', vertical: 'middle' } });
}

function writeBanner(ws: ExcelJS.Worksheet, row: number, label: string | null): number {
  paint(ws, row, [2, 3, 4, 5, 6, 7], (cell) => {
    style(cell, {
      font: { name: 'Aptos Narrow', size: 11, bold: true, color: { theme: 0 } },
      fill: addBannerFill,
    });
  });
  if (label) ws.getCell(row, 2).value = label;
  return row + 1;
}

function writeReconSection(
  ws: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  items: Array<{
    date: string | null;
    invoiceNumber: string;
    amount: number | null;
    notes: string | null;
    highlight?: boolean;
  }>,
  total: number | null,
): number {
  const headerFont: Partial<ExcelJS.Font> = {
    name: 'Aptos Narrow',
    size: 9,
    bold: true,
    color: { theme: 1 },
  };
  ws.getCell(startRow, 2).value = title;
  ws.getCell(startRow, 3).value = 'Date';
  ws.getCell(startRow, 4).value = 'Due Date';
  ws.getCell(startRow, 5).value = 'Account Description';
  ws.getCell(startRow, 6).value = 'Amount';
  ws.getCell(startRow, 7).value = 'Explanation Remark';
  paint(ws, startRow, [2, 3, 4, 5, 6, 7], (cell) => {
    style(cell, {
      font: headerFont,
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: hair(),
    });
  });
  ws.getCell(startRow, 2).font = { name: 'Aptos Narrow', size: 9, bold: false, color: { theme: 1 } };

  const dataStart = startRow + 1;
  const rows = items.length > 0 ? items : [{ date: null, invoiceNumber: '', amount: null, notes: null }];
  rows.forEach((item, index) => {
    const r = dataStart + index;
    ws.getCell(r, 3).value = asDate(item.date);
    ws.getCell(r, 5).value = item.invoiceNumber || null;
    ws.getCell(r, 6).value = item.amount;
    ws.getCell(r, 7).value = item.notes;
    paint(ws, r, [2, 3, 4, 5, 6, 7], (cell) => {
      style(cell, {
        font: { name: 'Aptos Narrow', size: 9, bold: true, color: { theme: 1 } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: hair(),
      });
    });
    ws.getCell(r, 3).numFmt = 'dd\\.mm\\.yyyy;@';
    ws.getCell(r, 4).numFmt = 'dd\\.mm\\.yyyy;@';
    ws.getCell(r, 6).numFmt = MONEY;
    if (item.highlight) {
      paint(ws, r, [2, 3, 4, 5, 6, 7], (cell) => {
        cell.fill = mismatchFill;
      });
    }
  });
  const lastData = dataStart + rows.length - 1;
  if (lastData > startRow) ws.mergeCells(startRow, 2, lastData, 2);
  ws.getCell(startRow, 2).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  const totalRow = lastData + 1;
  ws.mergeCells(totalRow, 2, totalRow, 5);
  paint(ws, totalRow, [2, 3, 4, 5], (cell) => {
    style(cell, { border: hair(['top', 'bottom', 'left']) });
  });
  if (total != null) {
    ws.getCell(totalRow, 6).value = total;
    style(ws.getCell(totalRow, 6), {
      font: { name: 'Aptos Narrow', size: 9, bold: true, color: { theme: 1 } },
      fill: sumFill,
      numFmt: ACCOUNTING,
      border: hair(['top']),
    });
  }
  return totalRow + 1;
}

function writeAdjustedRow(ws: ExcelJS.Worksheet, row: number, label: string, amount: number) {
  ws.mergeCells(row, 2, row, 5);
  ws.getCell(row, 2).value = label;
  ws.getCell(row, 6).value = amount;
  style(ws.getCell(row, 2), {
    font: { name: 'Aptos Narrow', size: 11, bold: true, color: { theme: 1 } },
    fill: adjustedFill,
    alignment: { horizontal: 'left' },
    border: hair(['left', 'top', 'bottom']),
  });
  paint(ws, row, [3, 4, 5], (cell) => {
    style(cell, { border: hair(['top', 'bottom']) });
  });
  style(ws.getCell(row, 6), {
    font: { name: 'Aptos Narrow', size: 9, bold: true, color: { theme: 1 } },
    fill: adjustedFill,
    alignment: { horizontal: 'center' },
    numFmt: ACCOUNTING,
    border: hair(['top']),
  });
}
