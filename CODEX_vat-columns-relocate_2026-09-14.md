Implemented the VAT-column relocation. No batch run and no deployment performed.

Final column order through the new VAT columns:

`A` *Invoice Header Identifier  
`B` *Business Unit  
`C` *Invoice Number  
`D` *Invoice Currency  
`E` *Invoice Amount  
`F` *Invoice Date  
`G` **Supplier[..]  
`H` **Supplier Number  
`I` *Supplier Site[..]  
`J` Invoice Type  
`K` Description  
`L` *Type  
`M` *Amount  
`N` Inv. Amt. Incl. VAT  
`O` VAT Amt.  
`P` Distribution Combination[..]  
`Q` Tax Classification Code[..]  
`R` Employee No  

Audit results:

- Distribution Combination: P / 16
- Employee No: R / 18
- GL: V / 22
- Cost Name: X / 24
- Contribution: Z / 26
- Solution Name: AB / 28
- Agency Name: AD / 30
- GL Description: AH / 34
- Banner spans: `A:R`, `S:AH`, `AI:BQ`
- `split_multi_emp.py` confirmed header-driven; no changes required.
- Ticket matching and source columns 47/42 remain unchanged.

Validation:

- `pytest -q tests/test_v30_invoice_tax_output.py`: **2 passed**
- `python3 -m py_compile ...`: passed
- `git diff --check`: passed

Scoped working-tree diff:

- `scripts/run_hybrid_v15_12.py`: 99 insertions, 1 deletion
- `scripts/run_v30.py`: 91 insertions, 6 deletions
- `tests/test_v30_invoice_tax_output.py`: new, 101 lines

The test now explicitly verifies that E→F remains `*Invoice Amount` → `*Invoice Date` and that the VAT columns immediately follow `*Amount`.
