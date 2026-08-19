import type { SolventumPodLine } from './solventum-pod.types';

const MARKS = /[\u202d\u202c\u200e\u200f]/g;

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

/** Convert Eastern Arabic-Indic / Persian digits to ASCII. */
export function normalizeArabicIndicDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_INDIC_DIGITS[digit] ?? digit);
}

export function cleanPodText(value: unknown): string {
  return normalizeArabicIndicDigits(String(value ?? ''))
    .replace(MARKS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePodKey(value: unknown): string {
  return cleanPodText(value).toLocaleLowerCase('en');
}

/** Strip Aljeel 3MOC-/3MOR- prefixes from manufacturer/catalog codes. */
export function stripManufacturerPrefix(value: unknown): string {
  return cleanPodText(value)
    .replace(/^3MO[CR]-/i, '')
    .replace(/^-+/, '');
}

export function extractTrxFromFilename(filename: string): string[] {
  const found = filename.match(/\d{8,10}/g) ?? [];
  return [...new Set(found.map((value) => value.replace(/^0+/, '') || value))];
}

/**
 * Pull catalog-like tokens from POD/sales text.
 * Examples: 1470A2, 56921, 1954, 6UR-2, EUL-3, ND-96, 900-832
 */
export function extractCatalogCodes(text: unknown): string[] {
  const raw = stripManufacturerPrefix(text);
  const codes = new Set<string>();

  for (const match of raw.matchAll(/\b(\d{3,5}[A-Z]{0,4}\d{0,2}(?:\.\d)?[A-Z]?)\b/gi)) {
    codes.add(match[1]!.toUpperCase());
  }
  for (const match of raw.matchAll(/\b([A-Z]{1,4}-?\d{1,3}[A-Z0-9]?)\b/gi)) {
    codes.add(match[1]!.toUpperCase());
  }
  for (const match of raw.matchAll(/\b(\d{3,4}-\d{3})\b/g)) {
    codes.add(match[1]!);
  }

  return [...codes].filter((code) => !/^(20\d{2}|3M|ESPE|NUPCO|EA)$/i.test(code));
}

/** Map MOH / tender composite shade text to Filtek catalog codes. */
export function shadeToCatalog(text: unknown): string | undefined {
  const raw = cleanPodText(text)
    // Common OCR confusions on shade letters/digits
    .replace(/\bshade\s*AY\b/gi, 'shade A2')
    .replace(/\bshade\s*AY\b/gi, 'shade A2')
    .replace(/\bshade\s*Al\b/gi, 'shade A1')
    .replace(/\bshade\s*A\)\b/gi, 'shade A2');
  const shade = raw.match(/\bshade\s*(A\d(?:\.\d)?|B\d)\b/i)?.[1]?.toUpperCase();
  if (shade) return `1470${shade}`;
  if (/POLISHING|SOF-?LEX/i.test(raw)) return '1954';
  if (/ADPER|SINGLE\s*BOND/i.test(raw)) {
    const code = extractCatalogCodes(raw).find((c) => /^51202/i.test(c));
    return code ?? '51202';
  }
  return undefined;
}

function looksLikeUom(token: string): boolean {
  return /^(EA|EACH|BOX(?:-\d+)?|BAG(?:-\d+)?|KIT(?:-\d+)?|KIT-1|PIECE|PCS)$/i.test(token);
}

function normalizeUom(token: string): string {
  const upper = token.toUpperCase();
  if (upper === 'EA' || upper === 'EACH' || upper === 'PIECE' || upper === 'PCS') return 'Each';
  if (/^KIT/i.test(token)) return token.toLowerCase().startsWith('kit') ? token : `Kit-1`;
  return token;
}

/**
 * Reject quantities that are actually catalog/manufacturer codes
 * (e.g. OCR "1954 SOF-LEX ... 1954 Box" or "37200 KETAC ... Each").
 * Do NOT reject merely because the qty digits also appear in the description
 * (e.g. tender line "27500 55 500 Composite" — 500 is a real delivered qty).
 */
export function isPlausibleDeliveredQuantity(
  quantity: number,
  manufacturer: unknown,
  description: unknown = '',
): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) return false;

  const qtyInt = Math.trunc(quantity);
  const qtyToken = String(qtyInt);
  const manuf = stripManufacturerPrefix(manufacturer).toUpperCase();

  if (manuf && (manuf === qtyToken || (/^\d+$/.test(manuf) && Number(manuf) === qtyInt))) {
    return false;
  }

  // Alphanumeric catalog whose leading digits equal qty (1470A2 vs 1470)
  const leading = manuf.match(/^(\d+)[A-Z]/i);
  if (leading && Number(leading[1]) === qtyInt) return false;

  // Description may repeat the manufacturer code as the false qty (1954 ... 1954 Box)
  const descCodes = extractCatalogCodes(description).map((code) => code.toUpperCase());
  if (manuf && descCodes.includes(manuf) && manuf === qtyToken) return false;
  if (
    manuf &&
    /^\d+$/.test(manuf) &&
    descCodes.some((code) => code === qtyToken && code === manuf)
  ) {
    return false;
  }

  return true;
}

export function isReceivingNoteLine(line: SolventumPodLine): boolean {
  return (
    /#receiving\b/i.test(line.sourceDoc) ||
    /محضر\s*استلام|Ministry of Health/i.test(line.itemDescription)
  );
}

/** Qty was inferred (e.g. √amount) because OCR missed Arabic-Indic digits — 1:1 TRXs only. */
export function isInferredPodQuantity(line: SolventumPodLine): boolean {
  return /#inferred\b/i.test(line.sourceDoc) || /inferred qty/i.test(line.itemDescription);
}

/**
 * Parse NUPCO GRN / bilingual POD text into delivered lines.
 * Prefer catalog+qty patterns over full table geometry (OCR is noisy).
 */
export function parsePodTextToLines(
  text: string,
  sourceDoc: string,
  filenameTrx: string[],
  confidence: number,
): SolventumPodLine[] {
  const collapsed = normalizeArabicIndicDigits(text).replace(/\r/g, '\n');
  const lines: SolventumPodLine[] = [];
  const seen = new Set<string>();
  const trxHint = filenameTrx[0] ?? '';

  const push = (
    partial: Omit<SolventumPodLine, 'trx' | 'sourceDoc' | 'confidence' | 'lot'> & {
      lot?: string;
      receiving?: boolean;
    },
  ) => {
    if (!Number.isFinite(partial.quantity) || partial.quantity <= 0) return;
    const manufacturer = stripManufacturerPrefix(partial.manufacturer);
    if (!manufacturer || manufacturer === '-' || manufacturer.length < 2) return;
    if (!isPlausibleDeliveredQuantity(partial.quantity, manufacturer, partial.itemDescription)) {
      return;
    }
    const key = `${normalizePodKey(manufacturer)}|${partial.quantity}|${normalizePodKey(partial.uom)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const receiving = Boolean(partial.receiving);
    lines.push({
      trx: trxHint,
      itemDescription: cleanPodText(partial.itemDescription).slice(0, 160),
      manufacturer,
      lot: partial.lot ?? '',
      quantity: partial.quantity,
      uom: normalizeUom(partial.uom),
      sourceDoc: `${sourceDoc}${receiving ? '#receiving' : '#proforma'}`,
      confidence: receiving ? Math.max(confidence, 0.92) : confidence,
    });
  };

  // Pass 0a: NUPCO tender / GRN triples "amount unitPrice qty DESCRIPTION"
  // Example: 3200.62 64.0125 50 POLISHING ...  |  27500.00 55 500 Composite ...
  for (const match of collapsed.matchAll(
    /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(POLISHING|SOF-?LEX|Composite)[\s\S]{0,120}/gi,
  )) {
    const amount = Number(match[1]);
    const unitPrice = Number(match[2]);
    const quantity = Number(match[3]);
    const blob = match[0];
    if (!(unitPrice > 0 && quantity > 0 && Math.abs(amount - quantity * unitPrice) <= Math.max(1, amount * 0.01))) {
      continue;
    }
    const manufacturer =
      shadeToCatalog(blob) ||
      (/POLISHING|SOF-?LEX/i.test(blob) ? '1954' : extractCatalogCodes(blob)[0] || '');
    if (!manufacturer) continue;
    if (!isPlausibleDeliveredQuantity(quantity, manufacturer, blob)) continue;
    const uom = /POLISHING|SOF-?LEX|100\s*\/\s*P|1OO\/P|Box-100/i.test(blob)
      ? 'Box-100'
      : /Composite/i.test(blob)
        ? 'Bag-1'
        : 'Each';
    push({
      itemDescription: blob,
      manufacturer,
      quantity,
      uom,
      receiving: true,
    });
  }

  // Pass 0b: "50 POLISHING ..." without full amount triple
  for (const match of collapsed.matchAll(
    /\b(\d{1,4}(?:\.\d+)?)\s+(POLISHING|SOF-?LEX)[\s\S]{0,80}/gi,
  )) {
    const quantity = Number(match[1]);
    const blob = match[0];
    if (!isPlausibleDeliveredQuantity(quantity, '1954', blob)) continue;
    push({
      itemDescription: blob,
      manufacturer: '1954',
      quantity,
      uom: /100\s*\/\s*P|1OO\/P|Box-100/i.test(blob) ? 'Box-100' : 'Box-100',
      receiving: true,
    });
  }

  // Pass 0c: Composite shade lines with qty (MOH receiving notes)
  // Prefer qty*price=amount triples in a wider window; else a nearby "N Piece".
  for (const match of collapsed.matchAll(
    /Composite[\s\S]{0,250}?shade\s*(A\d(?:\.\d)?|B\d|AY|Al)/gi,
  )) {
    const shadeRaw = match[1]!.toUpperCase().replace(/^AY$/, 'A2').replace(/^AL$/, 'A1');
    const manufacturer = `1470${shadeRaw}`;
    const start = Math.max(0, (match.index ?? 0) - 100);
    const end = Math.min(collapsed.length, (match.index ?? 0) + match[0].length + 160);
    const window = collapsed.slice(start, end);
    const blob = cleanPodText(window);

    let quantity: number | undefined;
    const triple = [
      ...window.matchAll(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g),
    ];
    for (const t of triple) {
      const amount = Number(t[1]);
      const unitPrice = Number(t[2]);
      const qty = Number(t[3]);
      if (unitPrice > 0 && qty > 0 && Math.abs(amount - qty * unitPrice) <= Math.max(1, amount * 0.01)) {
        if (isPlausibleDeliveredQuantity(qty, manufacturer, blob)) {
          quantity = qty;
          break;
        }
      }
    }
    if (quantity == null) {
      // Only trust Piece qty when the number is immediately beside Piece/EA (not distant OCR junk).
      const pieceQty = window.match(/\b(\d{1,3})\s*(?:Piece|Picce|EA|EACH|PCS)\b/i);
      if (
        pieceQty &&
        Number(pieceQty[1]) >= 5 &&
        isPlausibleDeliveredQuantity(Number(pieceQty[1]), manufacturer, blob)
      ) {
        quantity = Number(pieceQty[1]);
      }
    }
    if (quantity == null) continue;
    push({
      itemDescription: blob.slice(0, 160),
      manufacturer,
      quantity,
      uom: /Bag/i.test(blob) ? 'Bag-1' : 'Each',
      receiving: true,
    });
  }

  // Pass 0c2: MOH Composite detected but OCR missed Arabic-Indic qty — infer from
  // proforma net amount when amount is a perfect square (e.g. 3025 = 55×55).
  if (
    /محضر\s*استلام|Ministry of Health|الجهات المستهلكة|Ministr[yv]\s+of\s+Health/i.test(collapsed) &&
    /Composite[\s\S]{0,250}?shade\s*(A\d(?:\.\d)?|B\d|AY|Al)/i.test(collapsed)
  ) {
    const shadeMatch = collapsed.match(/Composite[\s\S]{0,250}?shade\s*(A\d(?:\.\d)?|B\d|AY|Al)/i);
    const shadeRaw = shadeMatch
      ? shadeMatch[1]!.toUpperCase().replace(/^AY$/, 'A2').replace(/^AL$/, 'A1')
      : undefined;
    const manufacturer = shadeRaw ? `1470${shadeRaw}` : undefined;
    const amountCandidates = new Set<number>();
    for (const m of collapsed.matchAll(/\b(\d{3,5}(?:\.\d+)?)\b/g)) {
      const n = Number(m[1]);
      // Typical MOH/proforma line totals for these packs.
      if (n >= 500 && n <= 20000) amountCandidates.add(Math.round(n));
    }
    const squares = [...amountCandidates]
      .map((amount) => ({ amount, root: Math.round(Math.sqrt(amount)) }))
      .filter(
        ({ amount, root }) =>
          root * root === amount &&
          root >= 10 &&
          root <= 200 &&
          Boolean(manufacturer) &&
          isPlausibleDeliveredQuantity(root, manufacturer, `amount ${amount}`),
      )
      // Prefer the largest printed total (e.g. 3025 → 55 over 2025 → 45).
      .sort((a, b) => b.amount - a.amount);
    const best = squares[0];
    if (best && manufacturer) {
      push({
        itemDescription: `Composite shade inferred qty ${best.root} from amount ${best.amount}`,
        manufacturer,
        quantity: best.root,
        uom: 'Each',
        receiving: true,
      });
      // Retag last pushed line as inferred so multi-line TRXs never consume it.
      const last = lines[lines.length - 1];
      if (last && last.quantity === best.root && last.manufacturer === manufacturer) {
        last.sourceDoc = last.sourceDoc.replace(/#receiving\b/, '#receiving#inferred');
        if (!/#inferred\b/.test(last.sourceDoc)) {
          last.sourceDoc = `${last.sourceDoc}#inferred`;
        }
      }
    }
  }

  // Pass 0d: Proforma "51202 ADPER ... 16 Each/Bach/gach"
  for (const match of collapsed.matchAll(
    /\b(51202|3MOC-51202)[\s\S]{0,160}?(\d{1,4})\s*(?:Each|Bach|gach|EA)\b/gi,
  )) {
    push({
      itemDescription: match[0],
      manufacturer: '51202',
      quantity: Number(match[2]),
      uom: 'Each',
      lot: match[0].match(/\b(117\d{5})\b/)?.[1] ?? '',
      receiving: false,
    });
  }

  // Pass 1: "1470A2 3M ESPE ... 30 EA" / "56921 3M ESPE ... 5 EA"
  for (const match of collapsed.matchAll(
    /\b([A-Z]{0,4}-?\d{3,5}[A-Z0-9./-]{0,6}|\d{3,5}[A-Z]{0,4}\d{0,2})\s+3M(?:\s*ESPE)?[\s\S]{0,60}?(\d{1,5}(?:\.\d+)?)\s*(EA|EACH|BOX(?:-\d+)?|BAG(?:-\d+)?|KIT(?:-\d+)?)/gi,
  )) {
    const manufacturer = match[1]!;
    if (/^\d{8,}$/.test(manufacturer)) continue;
    const quantity = Number(match[2]);
    if (!isPlausibleDeliveredQuantity(quantity, manufacturer, match[0])) continue;
    const aroundStart = Math.max(0, (match.index ?? 0) - 80);
    const description = collapsed.slice(aroundStart, (match.index ?? 0) + manufacturer.length);
    push({
      itemDescription: description,
      manufacturer,
      quantity,
      uom: match[3] ?? 'Each',
    });
  }

  // Pass 2: branded blocks (FILTEK / LIGHT CURE / SOF-LEX / POLISHING)
  const blockPattern =
    /((?:FILTEK|POLISHING|LIGHT\s*CURE|SOF-?LEX|RELYX|PHOTAC|ION\s+NICHRO|NICHRO|FIBER\s+POST|KETAC)[\s\S]{0,140}?)(?:\b(\d{3,5}[A-Z0-9./-]{0,8}|\d{3,4}-\d{3})\b)?[\s\S]{0,40}?(\d{1,5}(?:\.\d+)?)\s*(EA|EACH|BOX(?:-\d+)?|BAG(?:-\d+)?|KIT(?:-\d+)?)/gi;

  for (const match of collapsed.matchAll(blockPattern)) {
    const description = cleanPodText(match[1]);
    const embedded = match[2] ? stripManufacturerPrefix(match[2]) : '';
    const fromDesc = extractCatalogCodes(`${description} ${embedded}`)[0] ?? embedded;
    if (!fromDesc && !/POLISHING|SOF-?LEX/i.test(description)) continue;
    const manufacturer = fromDesc || '1954';
    const quantity = Number(match[3]);
    if (!isPlausibleDeliveredQuantity(quantity, manufacturer, description)) continue;
    push({
      itemDescription: description,
      manufacturer,
      quantity,
      uom: match[4] ?? 'Each',
    });
  }

  // Pass 3: nearby-line fallback — prefer the last plausible qty+UOM in the window
  if (lines.length === 0) {
    const tokens = collapsed
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (let i = 0; i < tokens.length; i += 1) {
      const catalogs = extractCatalogCodes(tokens[i]);
      if (catalogs.length === 0) continue;
      const manufacturer = catalogs[0]!;
      const window = tokens.slice(Math.max(0, i - 2), Math.min(tokens.length, i + 5)).join(' ');
      const qtyMatches = [
        ...window.matchAll(/(\d{1,5}(?:\.\d+)?)\s*(EA|EACH|BOX(?:-\d+)?|BAG(?:-\d+)?|KIT(?:-\d+)?)/gi),
      ];
      let chosen: RegExpMatchArray | undefined;
      for (const qtyMatch of qtyMatches) {
        const quantity = Number(qtyMatch[1]);
        if (isPlausibleDeliveredQuantity(quantity, manufacturer, window)) {
          chosen = qtyMatch;
        }
      }
      if (!chosen) continue;
      push({
        itemDescription: window,
        manufacturer,
        quantity: Number(chosen[1]),
        uom: chosen[2] ?? 'Each',
      });
    }
  }

  void looksLikeUom;
  return lines.filter((line) =>
    isPlausibleDeliveredQuantity(line.quantity, line.manufacturer, line.itemDescription),
  );
}

export function catalogsOverlap(left: unknown, right: unknown): boolean {
  const a = new Set(extractCatalogCodes(left).map((c) => c.replace(/-/g, '').toUpperCase()));
  const b = extractCatalogCodes(right).map((c) => c.replace(/-/g, '').toUpperCase());
  return b.some((code) => a.has(code));
}
