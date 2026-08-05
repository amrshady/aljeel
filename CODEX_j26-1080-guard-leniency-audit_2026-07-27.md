## Conclusion

The guard ran correctly, but its coverage rule is too permissive. It does not prove that each spreadsheet ticket has its own evidence. It proves only that each row can be associated with some evidence folder through any accepted key or heuristic.

That association may come from:

- the row’s Ticket;
- the row’s Ref.No;
- an adjacent sibling ticket (`ticket ± 1`);
- an employee ID appearing anywhere in a folder path;
- passenger-name text appearing anywhere in a folder path.

Once any folder is associated with the row, any generic supporting document and approval/OPEX document in that folder satisfies the row. The checker never confirms that those documents identify the row’s actual ticket.

This explains how the seven evidence-less tickets could pass while the only reported finding was the non-blocking `JAWAL_REF_DUPLICATE`.

One limitation: the J26-1080 spreadsheet and evidence-path inventory are not present in this repository, so the exact folder returned for each row cannot be named from source code alone. However, the successful result proves that one of the matching branches below returned a folder for every extracted row.

## 1. Spreadsheet row enumeration

The API reads every uploaded document and treats spreadsheet-looking files as candidates at [jawal-evidence-check.service.ts:33](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/jawal-evidence-check.service.ts:33).

For each valid XLSX:

- It converts every sheet to a raw 2D grid at [jawal-evidence-check.service.ts:95](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/jawal-evidence-check.service.ts:95).
- It accepts a workbook only if a sheet has both a recognizable `Ref.No` header and a recognizable `Ticket` header.
- It extracts the lines and passes them to `validateJawalEvidencePack` at [jawal-evidence-check.service.ts:146](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/jawal-evidence-check.service.ts:146).

Header recognition is in `findHeaderMap`:

- Ref.No column: [jawal-evidence-check.ts:373](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:373), especially lines 401 and 411.
- Ticket column: lines 402 and 411.
- Both columns must be present before the sheet is accepted.

Row extraction is in `extractJawalInvoiceLines` at [jawal-evidence-check.ts:425](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:425).

It iterates rows after the header, but not literally every spreadsheet row:

- A row is skipped if all identifier/content fields are empty.
- Scanning stops after five consecutive empty rows: lines 453–459.
- Totals/summary rows with no identifiers are skipped: lines 463–478.
- A content row missing both Ref.No and Ticket is retained and later blocked.
- Otherwise, a line is created even when only Ref.No or only Ticket is populated: lines 480–491.

Therefore, both Ref.No and Ticket are extracted, and both can be matching keys. The validator does not require Ticket to be populated on every retained line.

One additional selection detail: if several spreadsheets look like Jawal workbooks, a later one with extracted rows replaces the earlier `lines` value at service lines 99–103. The validator does not merge all candidate workbooks.

## 2. How “evidence present” is decided

### Folder discovery

`evidenceFolderName` derives a logical folder from each uploaded relative path at [jawal-evidence-check.ts:510](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:510).

It searches directory segments—not PDF content—for:

- ticket-like numbers;
- canonical letter-prefixed references;
- named pack patterns such as `TRAIN...`, `OPEX...`, `reservation...`;
- finally, almost any non-wrapper directory name of four or more characters.

Flat files have no evidence folder because paths with fewer than two segments return `null` at lines 511–512.

### Candidate keys for each row

`lineFolderKeys` is the main source of leniency at [jawal-evidence-check.ts:662](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:662).

For a ticket-bearing row it builds:

1. the normalized Ticket;
2. qualifying consecutive sibling tickets;
3. the Ref.No.

The Ref.No is always appended when populated, even if the row has a valid Ticket: line 689.

For a numeric airline ticket, `consecutiveTicketKeys` produces `ticket - 1` and `ticket + 1`. A sibling is added when another spreadsheet row has that ticket and either:

- the same numeric employee Ref.No; or
- the same normalized passenger description.

See lines 670–685.

### Folder matching and fallbacks

`findEvidenceFolderForLine` at [jawal-evidence-check.ts:734](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:734) accepts, in order:

1. A folder matching any candidate key—Ticket, sibling Ticket, or Ref.No: lines 740–743.
2. For nonstandard/PNR tickets, the ticket text appearing in any filename inside a folder: lines 745–755.
3. A numeric employee Ref.No appearing anywhere in a folder’s file paths: lines 758–759 and `folderContainsEmpId` at lines 693–701.
4. Passenger-name tokens appearing anywhere in a folder’s file paths: lines 761–763 and `folderContainsPassenger` at lines 703–728.

No PDF body scan occurs. The service only checks PDF magic/openability at [jawal-evidence-check.service.ts:110](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/jawal-evidence-check.service.ts:110). There is no PDF text extraction or ticket search.

### What satisfies the matched row

After any folder matches:

- Any `.pdf`, image, Word document, `.msg`, or `.eml` counts as a supporting document: [jawal-evidence-check.ts:585](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:585).
- Any `.msg`/`.eml`, or certain approval-looking filename, counts as approval.
- Any OPEX-looking filename/path counts as OPEX, subject to serial checking when `opexSerial` is populated.

These tests operate on the matched folder as a whole at [jawal-evidence-check.ts:1024](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:1024). They do not verify that the supporting document or approval names—or contains—the row’s ticket.

## 3. Why the seven passed

### TRAIN refs `26-972`, `26-988`, `26-995`

`26-NNN` is explicitly recognized as a train/local ticket format by `JAWAL_TICKET_TRAIN`, and preserved by `normalizeJawalTicket` at [jawal-evidence-check.ts:294](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:294).

It is not automatically an event/OPEX reference:

- Event classification depends on event/OPEX keywords, sponsorship account `60307021`, or `CE`/`EP`/`CRM` patterns.
- That logic is at [jawal-evidence-check.ts:352](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:352).
- `TRAIN` in the description does not cause `EVENT_SPONSORSHIP`; these are normally `TRAVEL`.

They are also not exempt from folder checking. Rather, they can be falsely satisfied through the broad alternatives:

- If `26-NNN` is in Ticket, its Ref.No is still an alternative folder key.
- If it is in Ref.No with Ticket blank, the Ref.No itself is the key.
- A folder can also be selected by employee-ID or passenger-name fallback.
- A shared folder’s generic PDF/message then satisfies every row mapped to it.

So the TRAIN issue is shared-folder satisfaction, not an event/OPEX exemption.

### Flights `4860401323` and `4860401324`

These are consecutive tickets. If their rows share a numeric Ref.No or the same passenger description, each row adds the other ticket as an acceptable folder key at lines 670–685.

Consequently, evidence under only `4860401323` can satisfy `4860401324`, or vice versa. The code intentionally documents this as a return-leg accommodation.

That is directly incompatible with the requirement that every spreadsheet ticket possess its own evidence.

### Flights `1950089142` and `1950089147`

These are not consecutive, so the `±1` rule does not connect them.

They can nevertheless share evidence through:

- the same Ref.No folder, because Ref.No remains an accepted key even when Ticket exists;
- employee Ref.No text in a sibling folder’s paths;
- passenger-name matching.

For `ALANAZI/SHAMSAH MS` and `ALKAF/FAHMI MR`, the passenger fallback can associate a row with any folder containing a sufficiently strong name token in its path. It does not require the ticket number in that folder or document.

Thus, if another ticket’s folder/file path contains `ALANAZI`, `SHAMSAH`, `ALKAF`, or `FAHMI`, that sibling folder can satisfy the evidence-less row.

## 4. Exact missing rule

The absent invariant is:

> For every extracted row containing a canonical Ticket, there must be evidence specifically attributable to that exact normalized Ticket.

Current Gate B2 instead asks:

> Can this row be associated with any folder using Ticket, adjacent-ticket, Ref.No, employee-ID, PNR, or passenger-name matching?

The decisive leniency is:

- `lineFolderKeys` adds Ref.No and adjacent sibling tickets: lines 662–690.
- `findEvidenceFolderForLine` accepts any of those keys, then employee/passenger fallbacks: lines 734–765.
- `folderHasSupportingDoc` accepts a generic document in the resulting shared folder: lines 629–631.
- The per-line loop treats that as complete coverage: lines 983–1073.

`JAWAL_REF_DUPLICATE` being a warning is separate. Repeated letter-prefixed refs are explicitly warning-only at [jawal-evidence-check.ts:891](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:891). Submission blocks only on `evidence.error`; warnings are recorded and submission continues at [invoices.service.ts:489](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:489).

## 5. Minimal rule tightening

Without implementing it, the minimal policy change is:

- For every line with a canonical Ticket, require a match for that exact normalized ticket identity.
- Do not allow Ref.No, employee-ID, passenger-name, or `ticket ± 1` to establish per-ticket coverage.
- Apply the same requirement to numeric airline tickets and `26-NNN` train tickets.
- A combined folder may satisfy multiple tickets only when its folder token explicitly expands to each exact ticket through `expandCombinedTicketFolder`; mere adjacency should not qualify.
- Require the supporting evidence used for that row to live under that exact ticket folder—or have an exact ticket token in its filename if flat-file evidence is intentionally supported.
- Keep Ref.No/shared-event matching only for rows with no Ticket, or for explicitly classified event/sponsorship rows governed by a separate group-evidence policy.
- Continue checking supporting-document and approval/OPEX requirements after the exact ticket match is established.

The narrowest code change would be centered on `lineFolderKeys` and `findEvidenceFolderForLine`, with the Gate B2 loop emitting `JAWAL_FOLDER_MISMATCH` whenever an exact per-ticket match is absent. No files were edited.
