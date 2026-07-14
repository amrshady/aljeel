/**
 * Jawal Travel upload checker (Gates A + B).
 *
 * Deliberately strict on Ref/Ticket format: the pipeline matcher may normalize
 * typos so allocations still resolve; this checker rejects them so the vendor
 * fixes the source spreadsheet.
 */

export type JawalEvidenceIssueCode =
  | 'JAWAL_TABLE_REQUIRED'
  | 'JAWAL_TABLE_EMPTY'
  | 'JAWAL_FILE_EMPTY'
  | 'JAWAL_UNSAFE_FILENAME'
  | 'JAWAL_MAGIC_MISMATCH'
  | 'JAWAL_PDF_INVALID'
  | 'JAWAL_WORKBOOK_INVALID'
  | 'JAWAL_EMPTY_FOLDER'
  | 'JAWAL_STRUCTURE_INVALID'
  | 'JAWAL_REF_MALFORMED'
  | 'JAWAL_REF_DUPLICATE'
  | 'JAWAL_FOLDER_MISMATCH'
  | 'JAWAL_SUPPORTING_DOC_MISSING'
  | 'JAWAL_APPROVAL_MISSING'
  | 'JAWAL_EVENT_INCOMPLETE'
  | 'JAWAL_ORPHAN_FOLDER';

export interface JawalEvidenceFinding {
  code: JawalEvidenceIssueCode;
  message: string;
  gate: 'A' | 'B';
  rule?: 'B1' | 'B1a' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';
  ref?: string;
  ticket?: string;
  path?: string;
  row?: number;
}

export interface JawalEvidenceIssue {
  code: JawalEvidenceIssueCode;
  message: string;
  details?: {
    findings?: JawalEvidenceFinding[];
    malformedRefs?: string[];
    duplicateRefs?: string[];
    missingFolders?: string[];
    orphanFolders?: string[];
    sourceSpreadsheet?: string;
  };
}

export interface JawalEvidenceValidation {
  error: JawalEvidenceIssue | null;
  findings: JawalEvidenceFinding[];
}

export interface JawalEvidenceFileMeta {
  /** Relative path as stored/uploaded (e.g. `CE-20-2026/ticket.pdf`). */
  fileName: string;
  sizeBytes: number;
  /** Optional magic / open checks already computed by the caller. */
  zeroBytes?: boolean;
  unsafeName?: boolean;
  magicMismatch?: boolean;
  pdfInvalid?: boolean;
  workbookInvalid?: boolean;
}

export type JawalLineKind = 'EVENT_SPONSORSHIP' | 'TRAVEL';

export interface JawalInvoiceLine {
  row: number;
  ref: string;
  ticket: string | null;
  description: string;
  account: string;
  type: string;
  opexSerial: string | null;
  kind: JawalLineKind;
}

/** PREFIX-NN-YYYY (e.g. CE-20-2026) — exact segment widths. */
export const JAWAL_REF_PREFIX_YEAR =
  /^[A-Z]{2,5}-\d{2}-\d{4}$/;

/** PREFIX-YYYY-NN (e.g. EP-2026-14, CRM-2026-30). */
export const JAWAL_REF_PREFIX_YEAR_FIRST =
  /^[A-Z]{2,5}-\d{4}-\d{1,3}$/;

/** PREFIX-N… (e.g. SIS-14) — single dash, digit-only suffix. */
export const JAWAL_REF_PREFIX_NUM = /^[A-Z]{2,5}-\d{1,4}$/;

/** Looks like a letter-prefix serial that must obey exact widths. */
export const JAWAL_REF_PREFIX_CANDIDATE =
  /^[A-Z]{2,5}-\d+(?:-\d+)?$/;

/** Airline / GDS ticket bodies (digits only). */
export const JAWAL_TICKET = /^\d{6,12}$/;

/** Train / hotel-local ticket numbers like 26-754. */
export const JAWAL_TICKET_TRAIN = /^\d{2}-\d{3,4}$/;

/** Airline code + PNR in the Ticket column (e.g. `176 ELDS5J`, `593 O6IV3Y`). */
export const JAWAL_TICKET_PNR = /^\d{1,3}\s+[A-Z0-9]{5,8}$/i;

function normalizeHeaderLabel(label: string): string {
  return label.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Real Jawwal tax invoices use bilingual headers such as `رقم المرجع  Ref. No.`. */
function isRefHeader(label: string): boolean {
  const normalized = normalizeHeaderLabel(label);
  if (!normalized) return false;
  if (/\bref\.?\s*no\.?\b/i.test(normalized)) return true;
  if (/\breference(?:\s*(?:no\.?|number|#))?\b/i.test(normalized)) return true;
  if (/رقم\s*المرجع/.test(normalized)) return true;
  return false;
}

function isTicketHeader(label: string): boolean {
  const normalized = normalizeHeaderLabel(label);
  if (!normalized) return false;
  if (/\bticket(?:\s*(?:no\.?|number|#))?\b/i.test(normalized)) return true;
  if (/رقم\s*التذكرة/.test(normalized)) return true;
  return false;
}

function isDescriptionHeader(label: string): boolean {
  const normalized = normalizeHeaderLabel(label);
  if (!normalized) return false;
  if (/^(description|remarks|particulars|details|narration)$/i.test(normalized)) return true;
  if (/\b(passenger\s*name|route|خط السير|اسم الراكب)\b/i.test(normalized)) return true;
  if (/اسم\s*الراكب/.test(normalized) || /خط\s*السير/.test(normalized)) return true;
  return false;
}

function isAccountHeader(label: string): boolean {
  const normalized = normalizeHeaderLabel(label);
  return /^(account(?:\s*(?:no\.?|number|#))?|gl(?:\s*account)?|acct)$/i.test(normalized);
}

function isTypeHeader(label: string): boolean {
  const normalized = normalizeHeaderLabel(label);
  return /^(type|category|nature|line\s*type)$/i.test(normalized);
}

function isOpexHeader(label: string): boolean {
  const normalized = normalizeHeaderLabel(label);
  return /^(opex(?:\s*(?:serial|no\.?|number|#|form))?)$/i.test(normalized);
}

const EVENT_KEYWORDS =
  /\b(sponsor(?:ship)?s?|opex|event|conference|congress|exhibition|seminar|forum)\b/i;
const SPONSORSHIP_ACCOUNTS = new Set(['60307021']);

const TOP_LEVEL_SKIP =
  /^(invoice|soa|crn|refund|summary|oracle|filled|al[\s_-]?jeel|j\d{2}-\d+|wetransfer)/i;

function isWrapperSegment(candidate: string): boolean {
  const token = candidate.trim();
  if (!token) return true;
  if (TOP_LEVEL_SKIP.test(token)) return true;
  if (/^wetransfer/i.test(token)) return true;
  if (/^J?\d{2}-\d+$/i.test(token)) return true;
  // Day / batch wrappers: 08-15may, 10may, 11MAY
  if (/^\d{1,2}(?:-\d{1,2})?may$/i.test(token)) return true;
  return false;
}

/** Path segments that can identify an evidence folder (not opaque free-text). */
function isEvidenceFolderSegment(candidate: string): boolean {
  const token = candidate.trim();
  if (!token || isWrapperSegment(token)) return false;
  if (isCanonicalJawalTicket(token)) return true;
  if (/^\d{6,12}(?:-\d{1,4}|_change)$/i.test(token)) return true;
  if (/^\d{4,8}$/.test(token)) return true;
  if (isLetterPrefixRef(token) && isCanonicalJawalRef(token)) return true;
  // Named packs: naif_ticket, barcelona_reservation_may, TRAIN_…, Re_Barcelona_…
  if (/_ticket$/i.test(token)) return true;
  if (/^(train|hotel|barcelona|opex|sponsor|re_barcelona|re_opex|fw_opex)/i.test(token)) return true;
  if (/reservation|congress|combined_training/i.test(token)) return true;
  return false;
}

/**
 * Expand combined ticket folders: `6905655845-46` → `6905655845`, `6905655846`.
 */
export function expandCombinedTicketFolder(folder: string): string[] {
  const normalized = normalizeCanonicalToken(folder);
  const change = normalized.match(/^(\d{6,12})_CHANGE$/i);
  if (change) return [change[1]!];

  const paired = normalized.match(/^(\d{6,12})-(\d{1,4})$/);
  if (!paired) return [normalized];

  const base = paired[1]!;
  const suffix = paired[2]!;
  if (suffix.length >= base.length) return [base];
  const companion = `${base.slice(0, -suffix.length)}${suffix}`;
  return companion === base ? [base] : [base, companion];
}

/** Consecutive return-leg ticket numbers often share the outbound folder. */
export function consecutiveTicketKeys(ticket: string): string[] {
  if (!JAWAL_TICKET.test(ticket)) return [];
  try {
    const n = BigInt(ticket);
    return [String(n - 1n), String(n + 1n)];
  } catch {
    return [];
  }
}

/** Slug for matching free-text refs to named folders. */
export function slugEvidenceToken(value: string): string {
  return normalizeCanonicalToken(value)
    .replace(/^(RE|FW|FWD|CHANGE)\s*:?\s*/i, '')
    .replace(/[^A-Z0-9]+/g, '');
}

/**
 * Shared event stem for cases like:
 * ref `change Euro Anesthes` ↔ folder `Euro Anesthesia 2026 - Approvals`
 * (combined multi-passenger PDFs live under one event folder, not per ticket).
 */
export function slugsShareEventStem(a: string, b: string): boolean {
  const left = slugEvidenceToken(a);
  const right = slugEvidenceToken(b);
  if (left.length < 8 || right.length < 8) return false;
  if (left.includes(right) || right.includes(left)) return true;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  // Require a substantial shared run so short serials never collide.
  for (let len = Math.min(shorter.length, 32); len >= 10; len -= 1) {
    for (let i = 0; i <= shorter.length - len; i += 1) {
      if (longer.includes(shorter.slice(i, i + len))) return true;
    }
  }
  return false;
}

export function sanitizeEvidenceRelativePath(name: string): string {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  const parts = normalized
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== '.' && part !== '..');

  if (parts.length === 0) return 'file';

  const safeParts = parts.map((part) => {
    const cleaned = part.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(0, 120);
    return cleaned || 'x';
  });

  return safeParts.join('/').slice(0, 500);
}

export function isUnsafeEvidenceFileName(fileName: string): boolean {
  if (!fileName || !fileName.trim()) return true;
  if (/[\0\x00-\x1f]/.test(fileName)) return true;
  if (fileName.includes('..')) return true;
  if (/^[\\/]/.test(fileName) || /^[A-Za-z]:[\\/]/.test(fileName)) return true;
  return false;
}

export function normalizeCanonicalToken(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Exact agreement after trim + case fold only.
 * Prefix-safe: SIS-14 must not match SIS-15.
 */
export function exactCanonicalMatch(a: string, b: string): boolean {
  return normalizeCanonicalToken(a) === normalizeCanonicalToken(b);
}

/**
 * Pull the ticket body from Jawwal tax-invoice cells.
 * Examples: `065 6905600652` → `6905600652`, `176 ELDS5J` → `ELDS5J`, `26-754` stays.
 */
export function normalizeJawalTicket(value: string): string {
  const raw = String(value).trim();
  if (!raw) return '';
  const digits = raw.match(/\d{6,12}/g);
  if (digits && digits.length > 0) {
    return digits[digits.length - 1]!;
  }
  if (JAWAL_TICKET_TRAIN.test(raw)) return raw;
  if (JAWAL_TICKET_PNR.test(raw)) {
    const parts = raw.split(/\s+/);
    return (parts[parts.length - 1] ?? raw).toUpperCase();
  }
  return raw.replace(/\s+/g, '');
}

export function isLetterPrefixRef(value: string): boolean {
  const token = normalizeCanonicalToken(value).replace(/[^A-Z0-9-]/g, '');
  return JAWAL_REF_PREFIX_CANDIDATE.test(token);
}

export function isCanonicalJawalRef(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;

  // Employee / internal numeric refs (Jawwal tax invoice Ref. No. column).
  if (/^\d{4,8}$/.test(raw)) return true;

  const token = normalizeCanonicalToken(raw).replace(/[^A-Z0-9-]/g, '');
  if (!token || /--/.test(token)) return false;

  // Letter-prefix serials must match exact widths (upload checker rejects typos).
  if (/^[A-Z]{2,5}-/.test(token)) {
    return (
      JAWAL_REF_PREFIX_YEAR.test(token) ||
      JAWAL_REF_PREFIX_YEAR_FIRST.test(token) ||
      JAWAL_REF_PREFIX_NUM.test(token)
    );
  }

  // Opaque free-text refs (hotel notes, change markers) — allowed as structure;
  // folder matching still prefers the Ticket column.
  return true;
}

export function isCanonicalJawalTicket(value: string): boolean {
  const raw = value.trim();
  const token = normalizeJawalTicket(raw);
  if (!token) return false;
  if (JAWAL_TICKET.test(token) || JAWAL_TICKET_TRAIN.test(token)) return true;
  // PNR body extracted from `176 ELDS5J`
  if (/^[A-Z0-9]{5,8}$/i.test(token) && JAWAL_TICKET_PNR.test(raw)) return true;
  return false;
}

export function classifyJawalLineKind(input: {
  ref: string;
  description: string;
  account: string;
  type: string;
}): JawalLineKind {
  const haystack = [input.ref, input.description, input.account, input.type].join(' ');
  if (EVENT_KEYWORDS.test(haystack)) return 'EVENT_SPONSORSHIP';
  if (SPONSORSHIP_ACCOUNTS.has(input.account.trim())) return 'EVENT_SPONSORSHIP';
  if (/\b(CE|EP|CRM)-\d/i.test(haystack)) return 'EVENT_SPONSORSHIP';
  return 'TRAVEL';
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value).trim();
}

function findHeaderMap(grid: unknown[][]): {
  headerRow: number;
  columns: {
    ref: number;
    ticket: number | null;
    description: number | null;
    account: number | null;
    type: number | null;
    opex: number | null;
  };
} | null {
  // Tax-invoice headers often sit below bilingual address blocks (row ~25).
  for (let row = 0; row < Math.min(grid.length, 80); row += 1) {
    const cells = grid[row] ?? [];
    let ref: number | null = null;
    let ticket: number | null = null;
    let description: number | null = null;
    let account: number | null = null;
    let type: number | null = null;
    let opex: number | null = null;

    for (let column = 0; column < cells.length; column += 1) {
      const label = cellText(cells[column]).replace(/:$/, '').trim();
      if (!label) continue;
      if (ref === null && isRefHeader(label)) ref = column;
      else if (ticket === null && isTicketHeader(label)) ticket = column;
      else if (description === null && isDescriptionHeader(label)) description = column;
      else if (account === null && isAccountHeader(label)) account = column;
      else if (type === null && isTypeHeader(label)) type = column;
      else if (opex === null && isOpexHeader(label)) opex = column;
    }

    if (ref !== null && ticket !== null) {
      return {
        headerRow: row,
        columns: { ref, ticket, description, account, type, opex },
      };
    }
  }
  return null;
}

export function looksLikeJawalWorkbook(sheets: unknown[][][]): boolean {
  return sheets.some((sheet) => findHeaderMap(sheet) !== null);
}

export function extractJawalInvoiceLines(sheets: unknown[][][]): JawalInvoiceLine[] {
  const lines: JawalInvoiceLine[] = [];

  for (const sheet of sheets) {
    const header = findHeaderMap(sheet);
    if (!header) continue;

    let emptyStreak = 0;
    for (let row = header.headerRow + 1; row < sheet.length; row += 1) {
      const cells = sheet[row] ?? [];
      const ref = cellText(cells[header.columns.ref]);
      const ticketRaw =
        header.columns.ticket !== null ? cellText(cells[header.columns.ticket]) : '';
      const description =
        header.columns.description !== null
          ? cellText(cells[header.columns.description])
          : '';
      const account =
        header.columns.account !== null ? cellText(cells[header.columns.account]) : '';
      const type =
        header.columns.type !== null ? cellText(cells[header.columns.type]) : '';
      const opexSerial =
        header.columns.opex !== null ? cellText(cells[header.columns.opex]) || null : null;

      if (!ref && !ticketRaw && !description) {
        emptyStreak += 1;
        if (emptyStreak >= 5) break;
        continue;
      }
      emptyStreak = 0;
      if (!ref && !ticketRaw) continue;

      lines.push({
        row: row + 1,
        ref,
        ticket: ticketRaw || null,
        description,
        account,
        type,
        opexSerial,
        kind: classifyJawalLineKind({ ref, description, account, type }),
      });
    }
  }

  return lines;
}

function basename(fileName: string): string {
  return fileName.split(/[\\/]/).pop() ?? fileName;
}

function pathSegments(fileName: string): string[] {
  return fileName
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

function evidenceFolderName(fileName: string): string | null {
  const parts = pathSegments(fileName);
  if (parts.length < 2) return null;

  // Prefer ticket / prefix-serial segments over wrapper dirs (wetransfer, dates, …).
  // Keep combined names (6905655845-46, 6905655862_change) so companion matching works.
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    const candidate = parts[i]!;
    if (isEvidenceFolderSegment(candidate)) return candidate;
  }

  // Named free-text evidence dirs (skip date/batch wrappers).
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    const candidate = parts[i]!;
    if (!isWrapperSegment(candidate) && candidate.length >= 4) return candidate;
  }

  // Skip a single top-level batch wrapper (e.g. J26-788/CE-20-2026/file.pdf).
  if (parts.length >= 3 && /^J?\d{2}-\d+$/i.test(parts[0]!)) {
    const nested = parts[1]!;
    if (isEvidenceFolderSegment(nested)) return nested;
  }
  return null;
}

function folderMatchesKey(folder: string, key: string): boolean {
  if (exactCanonicalMatch(folder, key)) return true;
  const k = normalizeCanonicalToken(key);
  if (!k) return false;
  for (const expanded of expandCombinedTicketFolder(folder)) {
    if (exactCanonicalMatch(expanded, k)) return true;
    const f = normalizeCanonicalToken(expanded);
    // Ticket bodies may live in change folders (6905655862_CHANGE).
    if (f.startsWith(`${k}-`) || f.startsWith(`${k}_`)) return true;
  }
  const f = normalizeCanonicalToken(folder);
  if (f.startsWith(`${k}-`) || f.startsWith(`${k}_`)) return true;

  // Free-text ref ↔ named folder (Barcelona Reservation ↔ barcelona_reservation_may),
  // including mangled “change Euro Anesthes” ↔ “Euro Anesthesia 2026 - Approvals”.
  const folderSlug = slugEvidenceToken(folder);
  const keySlug = slugEvidenceToken(key);
  if (folderSlug.length >= 8 && keySlug.length >= 8) {
    if (folderSlug.includes(keySlug) || keySlug.includes(folderSlug)) return true;
    if (slugsShareEventStem(folder, key)) return true;
  }
  return false;
}

function isSpreadsheetName(fileName: string): boolean {
  return /\.(xlsx|xlsm|xls|xlsb)$/i.test(basename(fileName));
}

function isMsgName(fileName: string): boolean {
  return /\.(msg|eml)$/i.test(basename(fileName));
}

function isApprovalEvidenceName(fileName: string): boolean {
  const base = basename(fileName);
  if (isMsgName(fileName)) return true;
  return /approved_personal_contribution|approval_requested|re_approved/i.test(base);
}

function isOpexName(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, '/');
  return /opex/i.test(basename(fileName)) || /\/opex[^/]*\//i.test(normalized);
}

function isSupportingDocName(fileName: string): boolean {
  const base = basename(fileName).toLowerCase();
  if (isSpreadsheetName(base)) return false;
  return /\.(pdf|png|jpe?g|webp|tif{1,2}|doc|docx|msg|eml)$/i.test(base);
}

function folderFiles(
  files: JawalEvidenceFileMeta[],
  folder: string,
): JawalEvidenceFileMeta[] {
  return files.filter((file) => {
    const name = evidenceFolderName(file.fileName);
    return name !== null && folderMatchesKey(name, folder);
  });
}

function uniqueFolders(files: JawalEvidenceFileMeta[]): string[] {
  const folders = new Set<string>();
  for (const file of files) {
    const folder = evidenceFolderName(file.fileName);
    if (folder) folders.add(normalizeCanonicalToken(folder));
  }
  return [...folders];
}

function folderHasOpex(files: JawalEvidenceFileMeta[], folder: string, opexSerial: string | null): boolean {
  const inFolder = folderFiles(files, folder);
  const opexFiles = inFolder.filter((file) => isOpexName(file.fileName));
  if (opexFiles.length === 0) return false;
  if (!opexSerial) return true;
  // B2: OPEX serial / filename token must exactly agree with the line ref/serial.
  return opexFiles.some((file) => {
    const base = basename(file.fileName);
    return (
      exactCanonicalMatch(base.replace(/\.[^.]+$/, ''), opexSerial) ||
      normalizeCanonicalToken(base).includes(normalizeCanonicalToken(opexSerial))
    );
  });
}

function folderHasMsg(files: JawalEvidenceFileMeta[], folder: string): boolean {
  return folderFiles(files, folder).some((file) => isApprovalEvidenceName(file.fileName));
}

function folderHasSupportingDoc(files: JawalEvidenceFileMeta[], folder: string): boolean {
  return folderFiles(files, folder).some((file) => isSupportingDocName(file.fileName));
}

function passengerKey(line: JawalInvoiceLine): string {
  return normalizeCanonicalToken(line.description).replace(/[^A-Z0-9]+/g, '');
}

function lineFolderKeys(line: JawalInvoiceLine, allLines: JawalInvoiceLine[]): string[] {
  const keys: string[] = [];
  // Jawwal evidence trees are usually keyed by ticket body; older packs / CE-SIS
  // trees still use the Ref.No folder name.
  if (line.ticket) {
    const ticket = normalizeJawalTicket(line.ticket);
    if (ticket) {
      keys.push(normalizeCanonicalToken(ticket));
      // Return legs often live in the outbound (±1) ticket folder — only when the
      // sibling ticket belongs to the same employee Ref.No (or same passenger).
      for (const sibling of consecutiveTicketKeys(ticket)) {
        const shared = allLines.some((other) => {
          if (normalizeJawalTicket(other.ticket || '') !== sibling) return false;
          if (
            /^\d{4,8}$/.test(line.ref.trim()) &&
            exactCanonicalMatch(other.ref, line.ref)
          ) {
            return true;
          }
          const a = passengerKey(line);
          const b = passengerKey(other);
          return a.length >= 8 && a === b;
        });
        if (shared) keys.push(normalizeCanonicalToken(sibling));
      }
    }
  }
  if (line.ref) keys.push(normalizeCanonicalToken(line.ref));
  return [...new Set(keys.filter(Boolean))];
}

function folderContainsEmpId(
  folder: string,
  line: JawalInvoiceLine,
  files: JawalEvidenceFileMeta[],
): boolean {
  const emp = line.ref.trim();
  if (!/^\d{4,8}$/.test(emp)) return false;
  return folderFiles(files, folder).some((file) => file.fileName.includes(emp));
}

function folderContainsPassenger(
  folder: string,
  line: JawalInvoiceLine,
  files: JawalEvidenceFileMeta[],
): boolean {
  const inFolder = folderFiles(files, folder);
  if (inFolder.length === 0) return false;

  const tokens = line.description
    .split(/[/\s]+/)
    .map((part) => part.replace(/[^A-Za-z]/g, ''))
    .filter((part) => part.length >= 4)
    .map((part) => normalizeCanonicalToken(part));

  if (tokens.length === 0) return false;

  // Prefer unique / multi-token matches — avoid short common names like SALEH.
  const strong = tokens.filter((token) => token.length >= 6);
  const needles = strong.length > 0 ? strong : tokens.length >= 2 ? tokens : [];
  if (needles.length === 0) return false;

  return inFolder.some((file) => {
    const hay = normalizeCanonicalToken(file.fileName);
    return needles.every((needle) => hay.includes(needle)) ||
      (strong.length > 0 && strong.some((needle) => hay.includes(needle)));
  });
}

/**
 * Prefer exact ticket/ref/slug matches over weak passenger-name heuristics.
 */
function findEvidenceFolderForLine(
  folders: string[],
  line: JawalInvoiceLine,
  files: JawalEvidenceFileMeta[],
  allLines: JawalInvoiceLine[],
): string | null {
  const keys = lineFolderKeys(line, allLines);

  const byKey = folders.find((folder) => keys.some((key) => folderMatchesKey(folder, key)));
  if (byKey) return byKey;

  const ticket = line.ticket ? normalizeJawalTicket(line.ticket) : '';
  if (ticket && !JAWAL_TICKET.test(ticket)) {
    const needle = normalizeCanonicalToken(ticket);
    if (needle.length >= 5) {
      const byPnr = folders.find((folder) =>
        folderFiles(files, folder).some((file) =>
          normalizeCanonicalToken(file.fileName).includes(needle),
        ),
      );
      if (byPnr) return byPnr;
    }
  }

  const byEmp = folders.find((folder) => folderContainsEmpId(folder, line, files));
  if (byEmp) return byEmp;

  // Last resort: unique passenger surname / multi-token name (train folders, changes).
  const byPassenger = folders.find((folder) => folderContainsPassenger(folder, line, files));
  if (byPassenger) return byPassenger;

  return null;
}

function folderMatchesLine(
  folder: string,
  line: JawalInvoiceLine,
  files: JawalEvidenceFileMeta[],
  allLines: JawalInvoiceLine[],
): boolean {
  const matched = findEvidenceFolderForLine([folder], line, files, allLines);
  return matched !== null && exactCanonicalMatch(matched, folder);
}

/**
 * Pure pass/fail Jawal upload checker. All findings are BLOCK severity.
 */
export function validateJawalEvidencePack(input: {
  lines: JawalInvoiceLine[];
  files: JawalEvidenceFileMeta[];
  sourceSpreadsheet?: string;
}): JawalEvidenceValidation {
  const findings: JawalEvidenceFinding[] = [];
  const { lines, files } = input;

  // ── Gate A ──────────────────────────────────────────────────────────────
  for (const file of files) {
    if (file.zeroBytes || file.sizeBytes <= 0) {
      findings.push({
        code: 'JAWAL_FILE_EMPTY',
        message: `Empty file is not allowed: ${file.fileName}`,
        gate: 'A',
        path: file.fileName,
      });
    }
    if (file.unsafeName || isUnsafeEvidenceFileName(file.fileName)) {
      findings.push({
        code: 'JAWAL_UNSAFE_FILENAME',
        message: `Unsafe file name: ${file.fileName}`,
        gate: 'A',
        path: file.fileName,
      });
    }
    if (file.magicMismatch) {
      findings.push({
        code: 'JAWAL_MAGIC_MISMATCH',
        message: `File content does not match its extension: ${file.fileName}`,
        gate: 'A',
        path: file.fileName,
      });
    }
    if (file.pdfInvalid) {
      findings.push({
        code: 'JAWAL_PDF_INVALID',
        message: `PDF could not be opened: ${file.fileName}`,
        gate: 'A',
        path: file.fileName,
      });
    }
    if (file.workbookInvalid) {
      findings.push({
        code: 'JAWAL_WORKBOOK_INVALID',
        message: `Workbook is not a valid Excel file: ${file.fileName}`,
        gate: 'A',
        path: file.fileName,
      });
    }
  }

  // Empty folders: folder segment present with zero nested files (defensive).
  const folderCounts = new Map<string, number>();
  for (const file of files) {
    const folder = evidenceFolderName(file.fileName);
    if (!folder) continue;
    const key = normalizeCanonicalToken(folder);
    folderCounts.set(key, (folderCounts.get(key) ?? 0) + 1);
  }
  for (const [folder, count] of folderCounts) {
    if (count <= 0) {
      findings.push({
        code: 'JAWAL_EMPTY_FOLDER',
        message: `Evidence folder is empty: ${folder}`,
        gate: 'A',
        path: folder,
      });
    }
  }

  // ── Gate B1 ─────────────────────────────────────────────────────────────
  if (lines.length === 0) {
    findings.push({
      code: 'JAWAL_TABLE_EMPTY',
      message:
        'The Jawal spreadsheet has Ref.No / Ticket headers but no line items to validate.',
      gate: 'B',
      rule: 'B1',
    });
  }

  for (const line of lines) {
    if (!line.ref && !line.ticket) {
      findings.push({
        code: 'JAWAL_STRUCTURE_INVALID',
        message: `Row ${line.row} is missing both Ref.No and Ticket.`,
        gate: 'B',
        rule: 'B1',
        row: line.row,
      });
    }
  }

  // ── Gate B1a ────────────────────────────────────────────────────────────
  const seenRefs = new Map<string, number>();
  const seenTickets = new Map<string, number>();
  const malformedRefs: string[] = [];
  const duplicateRefs: string[] = [];

  for (const line of lines) {
    if (line.ref) {
      if (!isCanonicalJawalRef(line.ref)) {
        malformedRefs.push(line.ref);
        findings.push({
          code: 'JAWAL_REF_MALFORMED',
          message: `Ref.No "${line.ref}" is malformed (row ${line.row}). Fix the spreadsheet — it will not be auto-corrected.`,
          gate: 'B',
          rule: 'B1a',
          ref: line.ref,
          row: line.row,
        });
      } else if (isLetterPrefixRef(line.ref)) {
        // Duplicate employee ids / free-text hotel refs are normal on Jawwal tax invoices.
        // Prefix serials (CE-/SIS-/EP-) must still be unique.
        const key = normalizeCanonicalToken(line.ref).replace(/[^A-Z0-9-]/g, '');
        const first = seenRefs.get(key);
        if (first !== undefined) {
          duplicateRefs.push(line.ref);
          findings.push({
            code: 'JAWAL_REF_DUPLICATE',
            message: `Duplicate Ref.No "${line.ref}" (rows ${first} and ${line.row}).`,
            gate: 'B',
            rule: 'B1a',
            ref: line.ref,
            row: line.row,
          });
        } else {
          seenRefs.set(key, line.row);
        }
      }
    }

    if (line.ticket) {
      if (!isCanonicalJawalTicket(line.ticket)) {
        malformedRefs.push(line.ticket);
        findings.push({
          code: 'JAWAL_REF_MALFORMED',
          message: `Ticket "${line.ticket}" is malformed (row ${line.row}). Fix the spreadsheet — it will not be auto-corrected.`,
          gate: 'B',
          rule: 'B1a',
          ticket: line.ticket,
          row: line.row,
        });
      } else {
        const key = normalizeCanonicalToken(normalizeJawalTicket(line.ticket));
        const first = seenTickets.get(key);
        if (first !== undefined) {
          duplicateRefs.push(line.ticket);
          findings.push({
            code: 'JAWAL_REF_DUPLICATE',
            message: `Duplicate Ticket "${line.ticket}" (rows ${first} and ${line.row}).`,
            gate: 'B',
            rule: 'B1a',
            ticket: line.ticket,
            row: line.row,
          });
        } else {
          seenTickets.set(key, line.row);
        }
      }
    }

    if (line.opexSerial) {
      const serialOk =
        isCanonicalJawalRef(line.opexSerial) ||
        (!!line.ref && exactCanonicalMatch(line.opexSerial, line.ref));
      if (!serialOk) {
        findings.push({
          code: 'JAWAL_REF_MALFORMED',
          message: `OPEX serial "${line.opexSerial}" is malformed (row ${line.row}).`,
          gate: 'B',
          rule: 'B1a',
          ref: line.opexSerial,
          row: line.row,
        });
      }
    }
  }

  // ── Gate B2 / B3 / B4 / B5 ───────────────────────────────────────────────
  const missingFolders: string[] = [];
  for (const line of lines) {
    const folderKeys = lineFolderKeys(line, lines);
    if (folderKeys.length === 0) continue;
    // Skip folder checks for lines whose ref/ticket already failed B1a —
    // still report folder miss only when token is canonical.
    const canCheckFolder =
      (!line.ref || isCanonicalJawalRef(line.ref)) &&
      (!line.ticket || isCanonicalJawalTicket(line.ticket));
    if (!canCheckFolder) continue;

    const folders = uniqueFolders(files);
    const matched = findEvidenceFolderForLine(folders, line, files, lines);
    const folderKey = folderKeys[0]!;
    if (!matched) {
      missingFolders.push(folderKey);
      findings.push({
        code: 'JAWAL_FOLDER_MISMATCH',
        message: `No evidence folder exactly matching "${folderKey}" (row ${line.row}). Prefix-similar names do not count.`,
        gate: 'B',
        rule: 'B2',
        ref: line.ref || undefined,
        ticket: line.ticket || undefined,
        row: line.row,
      });
      continue;
    }

    if (line.opexSerial && !folderHasOpex(files, matched, line.opexSerial)) {
      findings.push({
        code: 'JAWAL_FOLDER_MISMATCH',
        message: `OPEX serial "${line.opexSerial}" does not exactly match files in folder "${matched}" (row ${line.row}).`,
        gate: 'B',
        rule: 'B2',
        ref: line.ref || undefined,
        path: matched,
        row: line.row,
      });
    }

    if (!folderHasSupportingDoc(files, matched)) {
      findings.push({
        code: 'JAWAL_SUPPORTING_DOC_MISSING',
        message: `Folder "${matched}" has no supporting document (row ${line.row}).`,
        gate: 'B',
        rule: 'B3',
        path: matched,
        row: line.row,
      });
    }

    if (line.kind === 'EVENT_SPONSORSHIP') {
      const hasOpex = folderHasOpex(files, matched, line.opexSerial);
      if (!hasOpex) {
        findings.push({
          code: 'JAWAL_APPROVAL_MISSING',
          message: `Event/sponsorship line "${folderKey}" requires an OPEX form — a .msg alone is not enough (row ${line.row}).`,
          gate: 'B',
          rule: 'B4',
          ref: line.ref || undefined,
          path: matched,
          row: line.row,
        });
        findings.push({
          code: 'JAWAL_EVENT_INCOMPLETE',
          message: `Event/sponsorship evidence incomplete for "${folderKey}" (row ${line.row}).`,
          gate: 'B',
          rule: 'B5',
          ref: line.ref || undefined,
          path: matched,
          row: line.row,
        });
      }
    } else {
      const hasMsg = folderHasMsg(files, matched);
      const hasOpex = folderHasOpex(files, matched, line.opexSerial);
      if (!hasMsg && !hasOpex) {
        findings.push({
          code: 'JAWAL_APPROVAL_MISSING',
          message: `Travel/ticket line "${folderKey}" needs approval evidence (.msg thread or OPEX) (row ${line.row}).`,
          gate: 'B',
          rule: 'B4',
          ticket: line.ticket || undefined,
          ref: line.ref || undefined,
          path: matched,
          row: line.row,
        });
      }
    }
  }

  // ── Gate B6 reverse coverage ────────────────────────────────────────────
  const covered = new Set<string>();
  for (const line of lines) {
    for (const key of lineFolderKeys(line, lines)) covered.add(key);
  }

  const orphanFolders: string[] = [];
  for (const folder of uniqueFolders(files)) {
    if (TOP_LEVEL_SKIP.test(folder) || isWrapperSegment(folder)) continue;
    if (lines.some((line) => folderMatchesLine(folder, line, files, lines))) continue;
    orphanFolders.push(folder);
    findings.push({
      code: 'JAWAL_ORPHAN_FOLDER',
      message: `Evidence folder "${folder}" is not listed on any Ref.No / Ticket line.`,
      gate: 'B',
      rule: 'B6',
      path: folder,
    });
  }

  if (findings.length === 0) {
    return { error: null, findings: [] };
  }

  const primary = findings[0]!;
  return {
    error: {
      code: primary.code,
      message:
        findings.length === 1
          ? primary.message
          : `${primary.message} (+${findings.length - 1} more Jawal evidence issue${findings.length === 2 ? '' : 's'})`,
      details: {
        findings,
        malformedRefs: malformedRefs.length > 0 ? [...new Set(malformedRefs)] : undefined,
        duplicateRefs: duplicateRefs.length > 0 ? [...new Set(duplicateRefs)] : undefined,
        missingFolders: missingFolders.length > 0 ? [...new Set(missingFolders)] : undefined,
        orphanFolders: orphanFolders.length > 0 ? orphanFolders : undefined,
        sourceSpreadsheet: input.sourceSpreadsheet,
      },
    },
    findings,
  };
}

/** PDF magic + basic structure (not a full renderer). */
export function sniffPdfBuffer(bytes: Uint8Array): { ok: boolean; reason?: string } {
  if (bytes.length < 5) return { ok: false, reason: 'too small' };
  const head = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!);
  if (!head.startsWith('%PDF-')) return { ok: false, reason: 'bad magic' };
  const tail = bytes.slice(Math.max(0, bytes.length - 1024));
  const text = Array.from(tail, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ' ')).join('');
  if (!/%%EOF/i.test(text) && bytes.length < 64) {
    return { ok: false, reason: 'missing EOF' };
  }
  return { ok: true };
}

/** ZIP/OLE sniff for .xlsx / .msg. */
export function sniffContainerMagic(
  fileName: string,
  bytes: Uint8Array,
): { ok: boolean; reason?: string } {
  const base = basename(fileName).toLowerCase();
  if (bytes.length === 0) return { ok: false, reason: 'empty' };

  const isZip =
    bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  const isOle =
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;

  if (/\.xlsx$/i.test(base) || /\.xlsm$/i.test(base)) {
    return isZip ? { ok: true } : { ok: false, reason: 'expected zip/xlsx' };
  }
  if (/\.xls$/i.test(base) || /\.msg$/i.test(base)) {
    return isOle || isZip ? { ok: true } : { ok: false, reason: 'expected ole/msg' };
  }
  if (/\.pdf$/i.test(base)) {
    return sniffPdfBuffer(bytes).ok
      ? { ok: true }
      : { ok: false, reason: sniffPdfBuffer(bytes).reason };
  }
  return { ok: true };
}
