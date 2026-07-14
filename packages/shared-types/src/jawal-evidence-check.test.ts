import { describe, expect, it } from 'vitest';
import {
  classifyJawalLineKind,
  exactCanonicalMatch,
  extractJawalInvoiceLines,
  isCanonicalJawalRef,
  isCanonicalJawalTicket,
  looksLikeJawalWorkbook,
  sanitizeEvidenceRelativePath,
  sniffContainerMagic,
  validateJawalEvidencePack,
} from './jawal-evidence-check';

describe('jawal ref / ticket canonical rules (B1a)', () => {
  it('accepts well-formed CE-20-2026 and SIS-14', () => {
    expect(isCanonicalJawalRef('CE-20-2026')).toBe(true);
    expect(isCanonicalJawalRef('sis-14')).toBe(true);
    expect(isCanonicalJawalTicket('6905428831')).toBe(true);
  });

  it('rejects CE-202-26 without auto-correcting to CE-20-2026', () => {
    expect(isCanonicalJawalRef('CE-202-26')).toBe(false);
    expect(isCanonicalJawalRef('CE-20-26')).toBe(false);
    expect(isCanonicalJawalRef('CE--20-2026')).toBe(false);
    expect(isCanonicalJawalRef('CE-20-2026x')).toBe(false);
  });

  it('is prefix-safe for folder matching', () => {
    expect(exactCanonicalMatch('SIS-14', 'sis-14')).toBe(true);
    expect(exactCanonicalMatch('SIS-14', 'SIS-15')).toBe(false);
  });
});

describe('sanitizeEvidenceRelativePath', () => {
  it('keeps nested evidence paths and strips traversal', () => {
    expect(sanitizeEvidenceRelativePath('../CE-20-2026/OPEX form.pdf')).toBe(
      'CE-20-2026/OPEX_form.pdf',
    );
    expect(sanitizeEvidenceRelativePath('J26-788/SIS-14/ticket.msg')).toBe(
      'J26-788/SIS-14/ticket.msg',
    );
  });
});

describe('extractJawalInvoiceLines', () => {
  const sheet = [
    ['Ref.No', 'Ticket', 'Description', 'Account', 'Type'],
    ['CE-20-2026', '', 'Annual sponsorship event', '60307021', 'Sponsorship'],
    ['SIS-14', '6905428831', 'Staff travel RUH-JED', '51000001', 'Travel'],
    ['CE-202-26', '123', 'Bad refs', '51000001', 'Travel'],
  ];

  it('detects Jawal workbooks via Ref.No + Ticket headers', () => {
    expect(looksLikeJawalWorkbook([sheet])).toBe(true);
  });

  it('detects bilingual Jawwal tax-invoice headers', () => {
    const bilingual = [
      ...Array.from({ length: 25 }, () => [] as string[]),
      [
        'الرقم Sl. #',
        'Issue Date',
        'رقم المرجع      Ref. No.',
        'رقم التذكرة/ الفندق      Ticket No.',
        'Passenger Name',
      ],
      ['1', '2026-05-08', '1001202', '065 6905600652', 'ALANAZI/YOUSEF MR'],
    ];
    expect(looksLikeJawalWorkbook([bilingual])).toBe(true);
    const lines = extractJawalInvoiceLines([bilingual]);
    expect(lines[0]?.ref).toBe('1001202');
    expect(lines[0]?.ticket).toBe('065 6905600652');
  });

  it('extracts lines and classifies event vs travel', () => {
    const lines = extractJawalInvoiceLines([sheet]);
    expect(lines).toHaveLength(3);
    expect(lines[0]?.kind).toBe('EVENT_SPONSORSHIP');
    expect(lines[1]?.kind).toBe('TRAVEL');
    expect(classifyJawalLineKind(lines[0]!)).toBe('EVENT_SPONSORSHIP');
  });

  it('does not treat hotel reservation free-text as sponsorship', () => {
    expect(
      classifyJawalLineKind({
        ref: 'RE: Barcelona Reservation May',
        description: 'ABEER ALDHAFEERI',
        account: '',
        type: '',
      }),
    ).toBe('TRAVEL');
  });
});

describe('validateJawalEvidencePack', () => {
  it('blocks malformed refs and does not invent folder matches', () => {
    const lines = extractJawalInvoiceLines([
      [
        ['Ref.No', 'Ticket', 'Description', 'Account'],
        ['CE-202-26', '6905428831', 'Travel', '51000001'],
      ],
    ]);

    const result = validateJawalEvidencePack({
      lines,
      files: [
        { fileName: 'CE-20-2026/approval.msg', sizeBytes: 120 },
        { fileName: 'invoice-source.xlsx', sizeBytes: 2048 },
      ],
    });

    expect(result.error?.code).toBe('JAWAL_REF_MALFORMED');
    expect(result.findings.some((f) => f.code === 'JAWAL_REF_MALFORMED')).toBe(true);
    expect(result.error?.details?.malformedRefs).toContain('CE-202-26');
  });

  it('requires OPEX for event/sponsorship; .msg alone fails', () => {
    const lines = extractJawalInvoiceLines([
      [
        ['Ref.No', 'Ticket', 'Description', 'Account', 'Type'],
        ['CE-20-2026', '', 'Sponsorship gala', '60307021', 'Event'],
      ],
    ]);

    const fail = validateJawalEvidencePack({
      lines,
      files: [{ fileName: 'CE-20-2026/thread.msg', sizeBytes: 200 }],
    });
    expect(fail.findings.some((f) => f.rule === 'B4')).toBe(true);

    const pass = validateJawalEvidencePack({
      lines,
      files: [
        { fileName: 'CE-20-2026/thread.msg', sizeBytes: 200 },
        { fileName: 'CE-20-2026/OPEX-CE-20-2026.pdf', sizeBytes: 400 },
      ],
    });
    expect(pass.error).toBeNull();
  });

  it('accepts .msg alone for non-event travel lines', () => {
    const lines = extractJawalInvoiceLines([
      [
        ['Ref.No', 'Ticket', 'Description', 'Account'],
        ['SIS-14', '6905428831', 'Staff travel', '51000001'],
      ],
    ]);

    const result = validateJawalEvidencePack({
      lines,
      files: [
        { fileName: 'SIS-14/approval.msg', sizeBytes: 180 },
        { fileName: 'SIS-14/eticket.pdf', sizeBytes: 300 },
      ],
    });
    expect(result.error).toBeNull();
  });

  it('accepts airline PNR tickets and named *_ticket folders', () => {
    const lines = extractJawalInvoiceLines([
      [
        ['Ref.No', 'Ticket', 'Description'],
        ['1002092', '176 ELDS5J', 'NAIF ALBOMEDRAH'],
      ],
    ]);

    const result = validateJawalEvidencePack({
      lines,
      files: [
        { fileName: 'naif_ticket/ELDS5J.pdf', sizeBytes: 100 },
        {
          fileName:
            'naif_ticket/Approved_Personal_Contribution_Approval_Requested_for_Naif.msg',
          sizeBytes: 100,
        },
      ],
    });
    expect(result.error).toBeNull();
  });

  it('allows consecutive return-leg tickets to share the outbound folder', () => {
    const lines = extractJawalInvoiceLines([
      [
        ['Ref.No', 'Ticket', 'Description'],
        ['1000428', '593 6905655836', 'Leg out'],
        ['1000428', '560 6905655837', 'Leg back'],
      ],
    ]);

    const result = validateJawalEvidencePack({
      lines,
      files: [
        { fileName: '6905655836/approval.msg', sizeBytes: 100 },
        { fileName: '6905655836/eticket.pdf', sizeBytes: 100 },
      ],
    });
    expect(result.error).toBeNull();
  });

  it('does not borrow a consecutive ticket folder from a different employee', () => {
    const lines = extractJawalInvoiceLines([
      [
        ['Ref.No', 'Ticket', 'Description'],
        ['1000539', '176 6905655863', 'Other person'],
        ['1000735', '176 6905655864', 'BABIKER'],
      ],
    ]);

    const result = validateJawalEvidencePack({
      lines,
      files: [
        { fileName: '6905655863/other.msg', sizeBytes: 100 },
        { fileName: '6905655863/other.pdf', sizeBytes: 100 },
        { fileName: '6905655864/eticket.pdf', sizeBytes: 100 },
      ],
    });
    expect(
      result.findings.some(
        (f) => f.row === 3 && f.code === 'JAWAL_APPROVAL_MISSING',
      ),
    ).toBe(true);
  });

  it('matches hotel/train lines to named reservation folders via Ref text', () => {
    const lines = extractJawalInvoiceLines([
      [
        ['Ref.No', 'Ticket', 'Description'],
        ['RE: Barcelona Reservation May', '26-748', 'ABEER'],
      ],
    ]);

    const result = validateJawalEvidencePack({
      lines,
      files: [
        {
          fileName: 'barcelona_reservation_may/voucher.pdf',
          sizeBytes: 100,
        },
        {
          fileName: 'barcelona_reservation_may/RE_Barcelona_Reservation_May_.msg',
          sizeBytes: 100,
        },
      ],
    });
    expect(result.error).toBeNull();
  });

  it('matches train tickets to train_* folders by employee id in filenames', () => {
    const lines = extractJawalInvoiceLines([
      [
        ['Ref.No', 'Ticket', 'Description'],
        ['1000265', '26-754', 'HOSSAM MOHAMMED OSMAN'],
      ],
    ]);

    const result = validateJawalEvidencePack({
      lines,
      files: [
        {
          fileName:
            'train_2/RE_Approved_Personal_Contribution_Approval_Requested_for_Hossam_1000265.msg',
          sizeBytes: 100,
        },
        { fileName: 'train_2/153_ticket.pdf', sizeBytes: 100 },
      ],
    });
    expect(result.error).toBeNull();
  });

  it('matches change/event lines to a shared event folder with a combined PDF', () => {
    const lines = extractJawalInvoiceLines([
      [
        ['Ref.No', 'Ticket', 'Description'],
        ['change Euro Anesthes', '235 6905992212', 'ALQARNI/ADEL MR'],
        ['changeEuro Anesthesi', '235 6905992211', 'ALOTAIBI/MAJED MR'],
      ],
    ]);

    const result = validateJawalEvidencePack({
      lines,
      files: [
        {
          fileName:
            'Euro Anesthesia 2026 - Approvals/MR MAJED ALOTAIBI-9GCSWM change.pdf',
          sizeBytes: 100,
        },
        {
          fileName: 'Euro Anesthesia 2026 - Approvals/Fw_Euro_Anesthesia_Approvals.msg',
          sizeBytes: 100,
        },
        {
          fileName: 'Euro Anesthesia 2026 - Approvals/OPEX-CE-18-2026.pdf',
          sizeBytes: 100,
        },
      ],
    });
    expect(result.error).toBeNull();
  });

  it('allows duplicate employee Ref.No values but blocks duplicate prefix serials', () => {
    const empDup = validateJawalEvidencePack({
      lines: extractJawalInvoiceLines([
        [
          ['Ref.No', 'Ticket', 'Description'],
          ['1000428', '6905655836', 'Leg 1'],
          ['1000428', '6905655837', 'Leg 2'],
        ],
      ]),
      files: [
        { fileName: '6905655836/a.msg', sizeBytes: 100 },
        { fileName: '6905655836/a.pdf', sizeBytes: 100 },
        { fileName: '6905655837/b.msg', sizeBytes: 100 },
        { fileName: '6905655837/b.pdf', sizeBytes: 100 },
      ],
    });
    expect(empDup.findings.some((f) => f.code === 'JAWAL_REF_DUPLICATE')).toBe(false);

    const prefixDup = validateJawalEvidencePack({
      lines: extractJawalInvoiceLines([
        [
          ['Ref.No', 'Ticket', 'Description'],
          ['SIS-14', '6905428831', 'Travel A'],
          ['SIS-14', '6905428832', 'Travel B'],
        ],
      ]),
      files: [
        { fileName: 'SIS-14/a.msg', sizeBytes: 100 },
        { fileName: 'SIS-14/a.pdf', sizeBytes: 100 },
        { fileName: '6905428832/b.msg', sizeBytes: 100 },
        { fileName: '6905428832/b.pdf', sizeBytes: 100 },
      ],
    });
    expect(prefixDup.findings.some((f) => f.code === 'JAWAL_REF_DUPLICATE')).toBe(true);
  });

  it('blocks duplicate refs and orphan folders (B6)', () => {
    const lines = extractJawalInvoiceLines([
      [
        ['Ref.No', 'Ticket', 'Description'],
        ['SIS-14', '6905428831', 'Travel A'],
        ['SIS-14', '6905428832', 'Travel B'],
      ],
    ]);

    const result = validateJawalEvidencePack({
      lines,
      files: [
        { fileName: 'SIS-14/a.msg', sizeBytes: 100 },
        { fileName: 'SIS-14/a.pdf', sizeBytes: 100 },
        { fileName: 'SIS-99/orphan.pdf', sizeBytes: 100 },
      ],
    });

    expect(result.findings.some((f) => f.code === 'JAWAL_REF_DUPLICATE')).toBe(true);
    expect(result.findings.some((f) => f.code === 'JAWAL_ORPHAN_FOLDER')).toBe(true);
  });

  it('does not treat SIS-15 as a match for SIS-14', () => {
    const lines = extractJawalInvoiceLines([
      [
        ['Ref.No', 'Ticket', 'Description'],
        ['SIS-14', '6905428831', 'Travel'],
      ],
    ]);

    const result = validateJawalEvidencePack({
      lines,
      files: [
        { fileName: 'SIS-15/approval.msg', sizeBytes: 100 },
        { fileName: 'SIS-15/eticket.pdf', sizeBytes: 100 },
      ],
    });

    expect(result.findings.some((f) => f.code === 'JAWAL_FOLDER_MISMATCH')).toBe(true);
  });

  it('resolves evidence folders under a batch wrapper directory', () => {
    const lines = extractJawalInvoiceLines([
      [
        ['Ref.No', 'Ticket', 'Description'],
        ['SIS-14', '6905428831', 'Travel'],
      ],
    ]);

    const result = validateJawalEvidencePack({
      lines,
      files: [
        { fileName: 'May batch/SIS-14/approval.msg', sizeBytes: 100 },
        { fileName: 'May batch/SIS-14/eticket.pdf', sizeBytes: 100 },
      ],
    });

    expect(result.error).toBeNull();
  });
});

describe('sniffContainerMagic', () => {
  it('accepts %PDF magic', () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n%%EOF\n');
    expect(sniffContainerMagic('a.pdf', bytes).ok).toBe(true);
  });

  it('rejects pdf extension with zip magic', () => {
    const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(sniffContainerMagic('fake.pdf', bytes).ok).toBe(false);
  });
});
