# Asateel signature plan

Source: Labadi's call of 7 October 2026 and Abdul Ghaffar Ahmed's email "Asateel automation
signature", sent the same day.

## Goal

Before Labadi reviews an Asateel batch, the right warehouse person signs it, and then
Abdul Ghaffar signs it.

```
Supplier submits
  → batch appears in Labadi's review queue, marked Pending signature
  → first signer (by area) approves each invoice in the batch, one at a time
  → Abdul Ghaffar approves the whole batch in one action
  → the Pending signature mark comes off and Labadi can review it
  → Labadi approves → Asateel engine runs (unchanged from today)

Either signer can reject the whole batch with a reason. It goes back to the
supplier as changes requested, the supplier is emailed that reason, and a new
submit starts the signature steps again.
```

## How it works today

- `InvoicesService.submit` moves an Asateel batch `SUBMITTED → UNDER_REVIEW` and emails
  `INVOICE_SUBMIT_NOTIFY_EMAILS`.
- Labadi approves in `/ap/review`. `ApService.transition('APPROVED')` then calls
  `AsateelIntegrationService.dispatchAfterApproval`.
- The area is `Invoice.asateelRegion`: `CENTRAL | EASTERN | WESTERN | PT_PROJECT | MAIN`.
  The engine payload and the Oracle file-name lookup both use these five values.
- Only `AP_STAFF`, `AP_CLERK`, and `AP_APPROVER` staff can sign in
  (`identity.service.ts`, `AP_STAFF_ROLES`).
- The `ApprovalStep` table (`invoiceId`, `approverId`, `sequence`, `action`, `actedAt`)
  exists but only records Labadi's decision.

## Routing

| `asateelRegion`    | First signer       | Second signer |
| ------------------ | ------------------ | ------------- |
| `CENTRAL`          | Waleed Kobessy     | Abdul Ghaffar |
| `PT_PROJECT`       | Waleed Kobessy     | Abdul Ghaffar |
| `EASTERN_OUTBOUND` | Waleed Kobessy     | Abdul Ghaffar |
| `EASTERN_INBOUND`  | Shakeer Shaik      | Abdul Ghaffar |
| `WESTERN_OUTBOUND` | Waleed Kobessy     | Abdul Ghaffar |
| `WESTERN_INBOUND`  | Hussain Al Ghadeer | Abdul Ghaffar |
| `MAIN`             | Reda Abdelshafy    | Abdul Ghaffar |

---

## Step 1: Put inbound and outbound on the region

There is no direction field. Eastern and Western each become two `AsateelRegion` values. Central, P&T, and Main stay one value each.

`AsateelRegion`: `CENTRAL | PT_PROJECT | EASTERN_OUTBOUND | EASTERN_INBOUND | WESTERN_OUTBOUND | WESTERN_INBOUND | MAIN`.

- Replace `EASTERN` and `WESTERN` with those four values. Existing Eastern and Western batches become outbound.
- Create, update, and draft DTOs keep a single `asateelRegion`. Submit still fails with `ASATEEL_REGION_REQUIRED` when it is missing.
- Web: the region dropdown on `/invoices/new` and `/invoices/[id]` lists those seven values, in English and Arabic.
- The engine payload and the Oracle file name still use `EASTERN` or `WESTERN`. `asateelPipelineRegion` maps `EASTERN_INBOUND` and `EASTERN_OUTBOUND` to `EASTERN`, and the Western pair to `WESTERN`. The stored region stays the specific value.

**Done when** the seven choices appear in both languages, a batch stores one region value, and the engine still receives `EASTERN` or `WESTERN`.

## Step 2: Signers and sign-in

- Add a `UserRole` called `ASATEEL_SIGNER`, and add it to `AP_STAFF_ROLES` so these users can sign in.
- New table `AsateelSignerRoute`: `region`, `stage` (1 or 2), `signerEmail`, `isActive`. The migrations insert these rows and the five signer `AppUser` rows (see `docs/ap-staff-authorization.md`). `prisma/seed.ts` does the same for local databases, from the one list in `asateel-signer-routes.ts`:
  - Stage 1: the seven rows from the routing table.
  - Stage 2: a single row with no region, for Abdul Ghaffar (`agahmed@aljeel.com`).
- Seed `AppUser` rows with role `ASATEEL_SIGNER` for wkobessy, sshaik, halghadeer, rabdelshafy, and agahmed (all `@aljeel.com`).
- Ops: add the same five emails to the Cloudflare Access allow-list.
- Web: the `RequireRole` and `AppShell` navigation show signers only the **Needs review** link. They don't see the review queue, P&T Mappings, or the supplier upload.

**Done when** each of the five can sign in and sees only the Needs review screen.

## Step 3: A signing status in the flow

- `InvoiceStatus`: add `AWAITING_SIGNATURE`.
- Update `invoice-fsm.ts`:
  - `SUBMITTED → AWAITING_SIGNATURE` (Asateel)
  - `AWAITING_SIGNATURE → UNDER_REVIEW` (after Abdul Ghaffar signs)
  - `AWAITING_SIGNATURE → CHANGES_REQUESTED` (if a signer sends it back; see the open questions)
- In `submit`, for Asateel only:
  1. Look up the stage 1 signer from `AsateelSignerRoute` using `asateelRegion`.
  2. Create `ApprovalStep` rows: sequence 1 for the first signer, sequence 2 for Abdul Ghaffar, both `PENDING`. `approverId` holds the `AppUser.id`.
  3. Set the status to `AWAITING_SIGNATURE` instead of `UNDER_REVIEW`.
- Jawal and the other suppliers go `SUBMITTED → UNDER_REVIEW` exactly as today.
- Labadi's `/ap/review` list includes `AWAITING_SIGNATURE`, marked **Pending signature**. He can open the batch and see the files. Approve, reject, and hold stay available only once the status is `UNDER_REVIEW`.
- The supplier sees the batch as "Awaiting signature" in their list.

**Done when** a submitted Asateel batch has two pending steps assigned to the right people, and Labadi sees it in his queue marked pending signature.

## Step 4: Approving one invoice at a time (stage 1)

- New table `AsateelInvoiceSignature`: `invoiceId`, `invoiceNo`, `approvalStepId`, `signedById`, `signedAt`, unique on (`invoiceId`, `invoiceNo`).
- At submit time, save the invoice numbers that `AsateelInvoiceManifestService.validateUploadedFolder` already reads from the batch spreadsheet. It collects `invoiceNos`; return them as well.
- New `SignaturesController` at `/api/v1/signatures`, role `ASATEEL_SIGNER`:
  - `GET /` lists batches where the caller's step is the current `PENDING` step.
  - `GET /:invoiceId` returns the batch with its invoice rows, each row's matched evidence files, and which rows are signed.
  - `POST /:invoiceId/lines/:invoiceNo/approve` and `POST /:invoiceId/lines/:invoiceNo/revoke` (stage 1 only). These are the approved switch. They do not move the batch on.
  - `POST /:invoiceId/done` (stage 1 only). It works only when every row is approved. Step 1 becomes `APPROVED` and the batch stays `AWAITING_SIGNATURE`, now waiting for Abdul Ghaffar.
  - `POST /:invoiceId/reject` with a reason. The current signer, at either stage, sends the whole batch back. Status becomes `CHANGES_REQUESTED`, the reason is stored on the invoice, and the supplier submits it again. A new submit replaces the signature steps.
- Every action writes an `AuditEvent`.
- A double click, or two tabs, acts once. Done, Approve batch, and Reject batch only update a step that is still `PENDING`. A second Approve batch or Reject batch gets `409 SIGNATURE_ALREADY_ACTED`, and a second Done does nothing. Neither sends a second email.
- While a batch is with a signer, the supplier cannot add or delete files, change the region, or archive it.
- A new submit deletes the old signature steps and rows. The earlier signatures and the rejection reason stay in the audit log.

**Done when** Waleed can switch invoices approved one by one, and Done moves the batch to Abdul Ghaffar.

## Step 5: Approving the whole batch (stage 2)

Abdul Ghaffar does not mark invoices one by one. The other signers do.

- `POST /signatures/:invoiceId/approve` (stage 2 only). It works only after stage 1 is complete.
- One action marks step 2 `APPROVED` and moves the status `AWAITING_SIGNATURE → UNDER_REVIEW`. The **Pending signature** mark comes off the row already in Labadi's queue, and his normal review actions become available.
- The screen is the same file list and preview. There are no per-invoice switches. One **Approve batch** button covers every invoice. **Reject batch** is the same action as stage 1: a reason, then the batch returns to the supplier.
- After that, Labadi's approval works exactly as today and starts the Asateel engine.

**Done when** one action from Abdul Ghaffar puts the batch in `/ap/review`.

## Step 6: Notifications

Reuse `EmailService`, with a small `SignatureNotificationService` modeled on `InvoiceSubmitNotificationService`.

Labadi is notified every time the batch moves from one signer to the next, including when it becomes ready for his review. While it is still with a signer, the email and his queue both say the batch is pending signature.

When either signer rejects the batch, the supplier is notified. The email goes to the active users on that supplier, includes the rejection reason, and links to `/invoices/:id` so they can correct the batch and submit it again.

| When                                                 | Who gets the email                                              |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| Supplier submits (batch moves to the stage 1 signer) | The stage 1 signer, and Labadi (`INVOICE_SUBMIT_NOTIFY_EMAILS`) |
| Stage 1 finishes (batch moves to Abdul Ghaffar)      | Abdul Ghaffar, and Labadi                                       |
| Abdul Ghaffar signs (Pending signature comes off)    | Labadi, the same email he gets today on submit                  |
| Either signer rejects the batch                      | The supplier's active users                                     |

Signer emails link to `/signatures/:invoiceId`. Labadi's emails link to the batch in his queue. The supplier's rejection email links to `/invoices/:id`.

A failed email is logged and never blocks the signer's action. The signer's email and Labadi's email are sent separately, so one failing does not stop the other.

**Done when** each signer gets one email at their turn, Labadi gets an email on every handoff, and the supplier gets an email whenever a signer rejects the batch.

## Step 7: The signer screen (web)

- `/[locale]/signatures`: a list of waiting batches showing supplier, file name, area, number of invoices, rows signed so far, and submitted date.
- `/[locale]/signatures/[id]`:
  - The same file list and `document-evidence-viewer` the supplier and AP clerk use.
  - Stage 1 gets an approved switch on each invoice and a progress count such as "7 of 12 signed". **Done** sends the batch to Abdul Ghaffar once every switch is on.
  - Stage 2 gets no switches. One **Approve batch** button approves every invoice and sends the batch to Labadi.
  - Both stages get a reason field and a **Reject batch** button. Rejecting sends the whole batch back to the supplier.
- English and Arabic, in the same style as `/ap/review`.

**Done when** a signer can open a batch, look at each invoice's files, and approve without leaving the screen.

## Step 8: Keep the supplier's file name

Asateel names the batch with its own sequence number, such as 10 or 11. Check that the signing flow never renames the batch or its files. `renameInvoiceFolder` stays a manual action for Labadi only. A test covers this.

## Step 9: Tests and rollout

- API unit tests:
  - Routing for all seven regions.
  - The FSM transitions.
  - A row can't be approved by the wrong person, and the batch can't be approved before stage 1 is complete.
  - Abdul Ghaffar's approval moves the batch to `UNDER_REVIEW`.
  - Jawal flow unchanged.
- Web: shape tests for the new translations.
- Manual end-to-end test with the dev identities: supplier submits Eastern inbound, Shakeer signs the rows, Abdul Ghaffar signs, Labadi approves, the engine runs.
  - Done locally on 11 Oct 2026 with `SIG-E2E-13` (Eastern inbound), emails off. It covered: Waleed can't see it, Labadi sees it pending and can't approve, reject, or hold it, Shakeer signs and revokes rows, Done is refused until every row is signed, Abdul Ghaffar rejects with a reason, the supplier sees the reason and resubmits, the batch goes back to Shakeer at 0 signed, then Abdul Ghaffar approves and it reaches Labadi under review with its name and region unchanged. The audit log has every step.
  - Not done: Labadi's approval and the engine run, because that calls the vendor. Run it on staging.
- Rollout:
  1. Migrate. The migrations also insert the signer `AppUser` and `AsateelSignerRoute` rows. Check that they exist, and don't add them again.
  2. Update the Cloudflare allow-list.
  3. Deploy.
  4. Check that the server can send through `gog`.
- Batches already in `UNDER_REVIEW` stay in Labadi's queue and are not routed. The flow applies only to batches submitted after the deploy.

## Later: signature images

Labadi asked Abdul Ghaffar for each warehouse manager's authorized signature, and those files haven't arrived yet. When they do:

- Store them on the signer's `AppUser` record.
- When a row or batch is approved, stamp the signer's name, date, and signature image on the output the engine produces.

None of the steps above depend on this.

---

## Open questions for Labadi

1. **Sending back:** decided. The whole batch goes back to the supplier as `CHANGES_REQUESTED`, with the signer's reason. The supplier submits it again.
2. **Abdul Ghaffar refusing:** decided. He sends the batch back to the supplier, the same as the first signer.
3. **Away cover:** who signs when Waleed or a warehouse manager is away? Signers are rows in `AsateelSignerRoute`, so a change takes one row update. A batch that is already waiting stays with the signer it was assigned to at submit.
4. **Labadi on a rejection:** when a signer sends a batch back, it leaves Labadi's queue and only the supplier is emailed. Should Labadi get an email too?
5. **Oracle switch on pending batches:** Labadi can tick "Uploaded to Oracle" on a batch that is still pending signature. Should the switch stay locked until the batch is under review?
6. **Labadi editing files while signing:** AP staff can still add or delete files on a pending batch, so a signer could sign a set that changed. Should that be locked too?

## Order and size

| Step                                         | Size  |
| -------------------------------------------- | ----- |
| 1. Region list                               | ½ day |
| 2. Signers and sign-in                       | ½ day |
| 3. Signing status and routing on submit      | ½ day |
| 4 and 5. Approve per row and per batch (API) | ½ day |
| 6. Notifications                             | ¼ day |
| 7. Signer screens                            | ¾ day |
| 8 and 9. File-name check, tests, rollout     | ½ day |

That's about 3½ days, against Labadi's estimate of two. Steps 1 to 3 can ship first: they add the area list, and unsigned batches show in his queue marked pending signature.
