# Build spec: J26-1108 primary Jawal golden gate and scorer

This spec replaces J26-640 as the primary truth baseline while retaining J26-640 as a secondary regression check. No files were modified and no pipeline/API calls were made.

## 1. Workbook layouts and column maps

### New truth workbook

File: `qc/fixtures/golden-j26-1108/J26-1108-truth-clerk-reviewed.xlsx`

- Active sheet: `Sheet1`
- Header row: 3
- Data rows: Excel rows 4–105
- Data-row count: 102
- All 102 rows have `Employee No`
- `Sheet2` is the source invoice rendering, not the scoring sheet

| Logical field | Column | Index | Exact header |
|---|---:|---:|---|
| description | K | 11 | `Description` |
| amount | M | 13 | `*Amount` |
| distribution combination | O | 15 | `Distribution Combination[..]` |
| emp_no | R | 18 | `Employee No` |
| company | S | 19 | `Company` |
| location | T | 20 | `Location` |
| account | U | 21 | `Account` |
| cc | W | 23 | `Cost Center` |
| div | Y | 25 | `DIV` |
| solution | AA | 27 | `Solution` |
| agency | AC | 29 | `Agency` |
| row status | AI | 35 | `Row Status` |
| self-approval status | AM | 39 | `Self-Approval Status` |
| human review note | AN | 40 | `Human Review Note` |
| validator status | BB | 54 | `Validator Status` |
| invoice reference | BN | 66 | `Invoice Ref No` |
| OPEX serial | BO | 67 | `OPEX Serial` |
| OPEX allocation details | BS | 71 | `OPEX Allocation Details` |

The truth workbook has no dedicated passenger or ticket-number columns:

- Passenger identity is embedded at the start of `Description`.
- A GDS ticket number or voucher number is normally embedded in parentheses in `Description`.
- GDS examples: `4860528641`, `4860576072`.
- Voucher examples: `26-998`, `26-1001`, `26-1027`.
- The existing regex `26-\d{3}` is insufficient. J26-1108 contains four-digit vouchers, so extraction must accept at least `26-\d{3,}`.
- `Invoice Ref No` and `OPEX Serial` provide secondary identifiers.

Observed identifier coverage with the corrected voucher regex:

- 101 of 102 truth rows have an extractable GDS/voucher identifier in `Description`.
- The exception is truth row 15, whose description is malformed formula-like text:  
  `HASHAD/T+K41+K15:AF16+K15:AF17`
- That row still has stable fallback evidence:
  - amount `691.30`
  - employee `1001256`
  - invoice reference `1000181`
- Its corresponding pipeline row has amount `691.30`, invoice reference `1000181`, and description ticket `4860528664`.

### Pipeline v30 workbook

File: `batches/jawal-J26-1108/output/Spreadsheet-J26-1108-FILLED-v30.xlsx`

- Active sheet: `Sheet1`
- Header row: 3
- Data rows: Excel rows 4–93
- Data-row count: 90

The relevant pipeline columns are shifted two positions left from the new truth:

| Logical field | Column | Index | Exact header |
|---|---:|---:|---|
| description | K | 11 | `Description` |
| amount | M | 13 | `*Amount` |
| distribution combination | N | 14 | `Distribution Combination[..]` |
| emp_no | P | 16 | `Employee No` |
| company | Q | 17 | `Company` |
| location | R | 18 | `Location` |
| account | S | 19 | `Account` |
| cc | U | 21 | `Cost Center` |
| div | W | 23 | `DIV` |
| solution | Y | 25 | `Solution` |
| agency | AA | 27 | `Agency` |
| invoice reference | BL | 64 | `Invoice Ref No` |
| OPEX serial | BM | 65 | `OPEX Serial` |
| OPEX allocation details | BQ | 69 | `OPEX Allocation Details` |

Implementation should resolve columns by normalized header text and then assert the expected discovered indices. It should not rely solely on hard-coded positions.

## 2. Row classification and pairing

### Classification

Classification must be based on truth account:

```text
sponsorship := normalized truth account == "60307021"
travel      := all other truth rows
```

Do not retain the old rule that blank employee implies sponsorship. Under the new policy sponsorship employees are populated, and blank/nonblank employee is no longer a class discriminator.

Rows with blank account in the clerk truth are not sponsorship unless the truth account says `60307021`. Blank truth segments must remain blank; they must not normalize to `"0"`.

### Identifier extraction

Use these identifiers, in priority order:

1. GDS ticket: standalone 10-or-more-digit number in `Description`; preserve the full value.
2. Voucher: `26-\d{3,}` in `Description`.
3. Fallback composite identity from normalized invoice reference, amount, and description.

The old `_TICKET_RE` should be replaced or superseded. It currently accepts exactly ten digits or exactly three voucher digits.

### Travel pairing

Primary group key:

```text
("travel", extracted_ticket_or_voucher)
```

Within each group:

1. Pair exact normalized amount matches first.
2. Pair remaining rows deterministically by original Excel row order.
3. Preserve existing multiplicity behavior:
   - 1:1: direct pair.
   - N:1: one pipeline row may serve as the counterpart to each truth row.
   - 1:N: one truth row may be compared with each pipeline row.
   - N:M: amount-based multiset pairing, then deterministic residual pairing.
4. Report multiplicity and pairing method explicitly.

Do not use employee or scored segment values to choose a travel pair. Doing so would bias the score.

For the one malformed-description truth row, use a narrowly defined fallback:

```text
(normalized Invoice Ref No, amount)
```

Only accept it when the composite is unique on both sides. J26-1108’s `(1000181, 691.30)` pair satisfies this rule.

### Sponsorship/OPEX pairing

`OPEX Serial` alone is not unique. For example, `CE-202-26` spans several unrelated hotel, registration, and transport lines.

Use this group key:

```text
(
  "sponsorship",
  normalized OPEX Serial,
  normalized logical description,
  normalized Invoice Ref No
)
```

Normalization should:

- trim and case-fold;
- collapse whitespace;
- normalize harmless punctuation;
- allow the OPEX serial prefix to be removed from the beginning of `Description`, because prefix presence should not create a false non-match.

The description is the line-level discriminator. The serial and invoice reference protect against collisions.

Within a sponsorship group:

1. Parse truth employee as a singleton set.
2. Parse pipeline `Employee No` as a delimiter-separated set, accepting commas and surrounding whitespace.
3. Create a virtual pipeline allocation for every normalized employee in the pipeline set. Each virtual allocation inherits the pipeline row’s five segments, company, location, description, serial, and reference.
4. Pair each truth split row to the virtual allocation with the same employee.
5. Consume each virtual employee once per logical pipeline row.
6. Record truth employees missing from the pipeline set and unexpected pipeline employees separately.
7. If multiple physical pipeline rows share the group, perform deterministic employee-set matching across the complete group. This is an N:M set reconciliation, not positional pairing.
8. As an integrity check, compare:
   - sum of truth split amounts; and
   - sum of physical pipeline amounts.
   
   Amount equality validates grouping but is not one of the six scored fields.

This makes a combined pipeline employee value such as `1002075,1001986` equivalent to two virtual allocations for employee scoring. Comparing the literal combined string separately to each truth employee would incorrectly score both as mismatches.

## 3. Scoring semantics

The scored set remains exactly:

```python
("account", "cc", "div", "solution", "agency", "emp_no")
```

`company` and `location` should be loaded, normalized, included in diagnostics, and optionally exposed as non-gating informational comparisons. They are not part of the existing five-segment definition or the six-field headline score.

Required headline metrics:

- Per-field match/mismatch counts for all six fields.
- All-5 segments exact.
- All-5 plus employee exact.
- Off-by-one-field breakdown.
- Sponsorship-only metrics.
- Travel-only metrics.
- Truth-only and pipeline-only logical groups.
- Pairing-integrity counts:
  - direct 1:1 pairs;
  - N:1/1:N/N:M groups;
  - virtual sponsorship allocations;
  - missing/extra employees;
  - ambiguous groups;
  - amount-sum mismatches.

Normalization rules:

- Segment blanks remain `""`; blank must not equal zero.
- Numeric segment codes may have leading zero normalization as today, provided blank remains distinct.
- Employee values normalize numeric cells and remove a trailing `.0`.
- Pipeline employee strings become ordered-independent sets.
- Truth `-` may still normalize to blank for compatibility with J26-640, but it must not have special sponsorship scoring semantics in J26-1108.

For a split sponsorship truth row, `emp_no` matches when its employee is present in the matched pipeline allocation set. Therefore:

```text
all-5 + emp match
= all five inherited pipeline segments equal the truth row
  AND truth employee is contained in the pipeline row's employee set
```

Do not count unmatched, ambiguous, or extra rows as evaluated successes. The report should expose:

- paired-row accuracy; and
- end-to-end accuracy padded to the complete 102-row truth universe.

## 4. Concrete J26-1108 edge cases

### Combined pipeline OPEX rows versus split truth

Nine physical pipeline rows contain combined employee strings.

Examples:

| Identifier | Truth allocation | Pipeline allocation |
|---|---|---|
| `4860576012` | `1002075` SAR 337.50 + `1001986` SAR 112.50 | `1002075,1001986` SAR 450.00 |
| `26-1001` | SAR 5,625 + SAR 1,875 | combined SAR 7,500 |
| `26-1004` | SAR 825 + SAR 275 | combined SAR 1,100 |
| `26-1005` | SAR 2,325 + SAR 775 | combined SAR 3,100 |
| `4860576072` | SAR 2,624.99 + SAR 875 | combined SAR 3,499.99 |
| `4860576073` | SAR 2,624.99 + SAR 875 | combined SAR 3,499.99 |
| `4860576074` | SAR 2,624.99 + SAR 875 | combined SAR 3,499.99 |
| `26-1009` | SAR 7,425 + SAR 2,475 | combined SAR 9,900 |
| `26-998` | three truth employees at 583.34/583.33/583.33 | `1001422,1002169,1001530`, SAR 1,750 |

`26-998` is especially important: its three clerk rows currently have blank truth account/segments, while the pipeline assigns sponsorship account `60307021`. It is a combined-allocation edge case but is not one of the 19 truth rows classified as sponsorship by account.

### Sponsorship employees missing in pipeline

The clerk truth assigns employee `1001959` to sponsorship tickets:

- `4860576077`
- `4860576078`
- `4860576079`

The v30 pipeline has blank employee on all three. These must now be employee mismatches under the new policy.

### Four-digit vouchers

Examples include:

- `26-1000`
- `26-1001`
- `26-1010`
- `26-1027`

The current scorer’s `26-\d{3}` expression misses these entirely.

### Voucher rows with material truth/pipeline differences

Several voucher rows are blank-coded in truth but populated by the pipeline, including hotel, train, and transfer rows. Examples include `26-1000`, `26-1002`, `26-1010`, and `26-1022`.

These rows must still be paired and scored. They should not disappear merely because they lack a GDS number.

### Personal-contribution account `21070229`

Truth has two rows:

- `4860528652`, employee `1002648`, truth account `21070229`; the pipeline does not retain that account assignment.
- `4860576001`, employee `1002201`, account `21070229`; represented in the pipeline.

These remain travel/non-sponsorship rows for breakout purposes.

### Repeated non-sponsorship ticket groups

Truth contains repeated ticket groups that are not simple sponsorship allocation splits:

- `4860633346`: two truth rows, one pipeline row.
- `4860665526`: two truth rows, one pipeline row.

The scorer must report these as N:1 groups and apply deterministic pairing semantics rather than silently index-aligning or dropping extras.

### Malformed description

Truth row 15 has no usable ticket because its description contains spreadsheet-formula residue. It requires the unique `(Invoice Ref No, amount)` fallback described above.

### Workbook-size mismatch

- Truth: 102 physical rows.
- Pipeline v30: 90 physical rows.

This is expected in part because split truth allocations correspond to combined physical pipeline rows. Physical row-count equality must not be a gate condition. Logical pairing coverage and virtual allocation coverage are the relevant measures.

## 5. Golden-gate wrapper design

The new primary gate should be a deterministic, offline scorer snapshot against:

- the committed clerk-reviewed truth workbook; and
- the committed v30 pipeline workbook.

It should not perform a raw full-cell workbook comparison. Debug/workflow columns, human notes, timestamps, and physical split/combined representation make full workbook equality both noisy and semantically wrong.

The expected snapshot should include stable scoring and pairing aggregates:

- truth physical rows: `102`
- truth employee coverage: `102/102`
- truth sponsorship rows: `19`
- truth sponsorship employee coverage: `19/19`
- pipeline physical rows
- logical/virtual evaluated count
- pairing-method breakdown
- unmatched and ambiguous counts
- per-field match/mismatch counts
- all-5 and all-5-plus-employee counts
- sponsorship and travel breakouts
- sponsorship missing/extra employee counts
- account breakout, especially `60307021` and `21070229`
- amount-integrity mismatch count
- truth and pipeline SHA-256 values
- scorer schema/version identifier

The gate should also enforce structural invariants independently of the expected metric snapshot:

- correct truth file hash;
- active scoring sheet and header row;
- 102 truth rows;
- 102 populated truth employee numbers;
- 19 truth `60307021` rows;
- all 19 sponsorship rows with employees;
- no ambiguous header discovery;
- no unclassified or silently skipped truth rows.

A small mismatch-detail artifact may be generated manually by the scorer, but the committed gate expectation should contain deterministic aggregates plus stable unmatched logical keys, not entire workbook rows or clerk notes.

### Artifact-versus-live limitation

The limitation documented in `qc/jawal_golden_check.py` still applies: scoring a committed v30 artifact detects truth/scorer drift and artifact tampering, but it does not detect a pipeline-code regression that has not regenerated that artifact.

Therefore:

- Make J26-1108 the primary offline gate now.
- Keep the existing J26-788 aggregate gate and J26-640 scorer/gate as secondary checks.
- Clearly label J26-1108 as an artifact-based semantic accuracy gate.
- Preserve the future upgrade path: run the deterministic pipeline stage into an isolated temporary output directory, with no Gemini/API call, no locked-artifact overwrite, and no persistent cache/history mutation, then score that fresh output.
- Do not claim that the initial artifact gate validates current live pipeline code.

## 6. Minimal implementation plan

### Change `qc/score_against_truth.py`

Refactor it into a format-aware scorer without breaking J26-640 compatibility.

Proposed public functions:

```python
def discover_columns(path: Path) -> WorkbookLayout
def load_truth(path: Path, profile: str = "auto") -> list[TruthRow]
def load_pipeline(path: Path) -> list[PipelineRow]

def extract_line_identifier(description: object) -> str | None
def normalize_employee_set(value: object) -> frozenset[str]
def classify_truth_row(row: TruthRow) -> Literal["sponsorship", "travel"]

def sponsorship_group_key(row: BaseRow) -> tuple[str, str, str, str]
def pair_travel_rows(
    truth_rows: list[TruthRow],
    pipeline_rows: list[PipelineRow],
) -> PairingResult
def pair_sponsorship_rows(
    truth_rows: list[TruthRow],
    pipeline_rows: list[PipelineRow],
) -> PairingResult
def pair_rows_by_policy(
    truth_rows: list[TruthRow],
    pipeline_rows: list[PipelineRow],
) -> PairingResult

def score_pairs(pairing: PairingResult) -> dict[str, object]
def score_workbooks(
    pipeline_path: Path,
    truth_path: Path,
    truth_profile: str = "auto",
) -> dict[str, object]
```

Required behavioral changes:

- discover truth columns from headers;
- add the J26-1108 profile;
- preserve blank segments instead of converting them to zero;
- accept four-or-more-digit vouchers;
- load ticketless rows instead of dropping them;
- implement employee-set normalization;
- implement sponsorship virtual allocations;
- add pairing-integrity diagnostics;
- make the report title/batch dynamic;
- retain the existing CLI arguments.

### Add `qc/jawal_j26_1108_golden_check.py`

Responsibilities:

```python
def actual_snapshot() -> dict[str, object]
def diff_snapshot(
    expected: dict[str, object],
    actual: dict[str, object],
) -> list[str]
def main() -> int
```

It should:

- hash and validate both workbooks;
- call `score_workbooks(...)`;
- project only deterministic gate fields;
- compare them with the committed expectation;
- print concise drift details;
- remain read-only and offline.

### Add `qc/jawal_j26_1108_golden_expected.json`

Commit the reviewed deterministic snapshot. Include a schema version so pairing/scoring rule changes require an explicit baseline review.

### Tests

Add focused tests, preferably in a new file such as `tests/test_score_against_truth_j26_1108.py`, covering:

- header discovery for both layouts;
- four-digit voucher extraction;
- blank segment distinct from zero;
- N:1 travel behavior;
- split truth versus combined pipeline employees;
- employee-set ordering and whitespace;
- missing and unexpected sponsorship employees;
- duplicate OPEX serials separated by description/reference;
- amount-sum integrity checks;
- unique invoice-reference fallback;
- ambiguous fallback rejection;
- J26-640 `"-"` compatibility.

### Existing primary/secondary entry point

If CI or a wrapper currently invokes only one Jawal gate, update that configuration so:

1. J26-1108 semantic gate is primary.
2. J26-640 remains secondary.
3. Existing J26-788 artifact-summary regression remains available and is not silently removed.

No pipeline invocation belongs in this initial implementation.
