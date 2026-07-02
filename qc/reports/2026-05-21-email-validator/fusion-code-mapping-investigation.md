# Fusion Code Mapping Investigation (2026-05-21)

## Key Finding: Fusion-internal codes are in a DIFFERENT namespace than Manpower codes

Oracle Fusion uses 5-digit codes for Division/Agency/Solution that do NOT match
the Manpower-derived 3-5 digit codes used in the GL combo.

### Evidence

| Emp No | Name | Form Div | Manpower Div | Form Agency | Manpower Agency |
|--------|------|----------|-------------|-------------|-----------------|
| 1000539 | Ahmad R Elzaim | 62014 | 120 | 60207 | 10206 |
| 1000407 | Farhan Modhsher Alenaz | 62011 | 190 | 60338 | 10200 |
| 1000450 | Belal Issa Mahmoud | 60010 | 196 | 60420 | 10081 |
| 1002169 | Abdallah Abdulrahman A | 60009 | 196 | 60380 | 10156 |
| 1001202 | Yousef Aeiad Alanazi | 60010 | 196 | 60338 | 10083 |
| 1001811 | Ahmed Hani  Alem | 62014 | 194 | 60207 | 10153 |
| 1002469 | Ariej Ibrahim Bahkali | - | 194 | - | 10126 |
| 1000361 | Mustafa Mahmoud Aljaro | 60009 | 196 | 60394 | 10055 |
| 1000668 | Abdulaziz Mohammed Ala | 62011 | 190 | 60338 | 10200 |
| 1000529 | Hamzeh Hosin Haddad | - | 196 | - | 10055 |
| 1002338 | Abdullah Abdulaziz Alg | 62014 | 120 | 60133 | 10206 |
| 1002340 | Faisal Naif Bin Mudhia | 62012 | 120 | 60207 | 10206 |
| 1001406 | Yasin Salahaldeen Isma | 60010 | 196 | 60420 | 10081 |
| 1000599 | Ahmad Abdullah Alzahra | - | 888 | - | 88888 |
| 1000927 | Ali Awadh Alqahtani | 60007 | 888 | 60338 | 88888 |
| 1000615 | Aamir Abdellatif Shari | 585087 | 196 | 60391 | 10052 |
| 1000764 | Abdullah Majed Almusay | 60010 | 120 | 60382 | 10206 |
| 1000219 | Barra Yousef Alfar | 62011 | 196 | 60338 | 10082 |
| 1002412 | Amr  Mohamed Abousewil | 62014 | 194 | 60338 | 10113 |
| 1002312 | Mohamed  Ahmed Mosa | 62011 | 194 | 60338 | 10153 |
| 1002345 | Omar Iehab Abu Noufal | 62014 | 194 | 60158 | 10126 |
| 1000055 | Reynand Jesus Tagra | 62014 | 120 | 140003 | 10206 |
| 1000328 | Ibrahim Mohammad Abu A | 62014 | 120 | 60207 | 10206 |
| 1002294 | Nagmaldin  Abdelhamid  | 62014 | 194 | 140003 | 10155 |
| 1001011 | Mahmoud  Ahmad  Wadi | 60008 | 192 | 60348 | 10005 |
| 1000975 | Abdulaziz Mohammed Ala | 62014 | 194 | 60129 | 10111 |
| 1000182 | Nabel Ahmed Mousa Elka | 62014 | 194 | 60338 | 10126 |
| 1000789 | Saud Mohammed AlBalawi | 62011 | 190 | 60338 | 10200 |
| 1000398 | Ahmed Ali Mohammed Ela | 60010 | 196 | 60338 | 10100 |
| 1000490 | Ali Kamal Eldin Elhag | 62012 | 120 | 60394 | 10206 |
| 1000453 | Omar Mahmoud Khader | - | 196 | - | 10200 |
| 1000666 | Amr Abdulaziz Bukhari | 62012 | 120 | 60412 | 10206 |
| 1000320 | Ayed Ahmad Ayed Zeiade | 60009 | 196 | 60339 | 10055 |
| 1002091 | Mostafa Mahmoud Amer | 62014 | 194 | 60158 | 10200 |
| 1002308 | Yousef Saleh AlDighrir | 62014 | 120 | 60129 | 10206 |
| 1000575 | Mbwana Hamisi Konodo | - | 888 | - | 88888 |
| 1000443 | Abdelrahman Z Almadhou | 60007 | 120 | 60129 | 10206 |
| 1001986 | Mohamed Mahmmuod Gasee | 60010 | 196 | 60338 | 10156 |
| 1002484 | Omar Mohamed Elshazli | 62011 | 170 | 60338 | 10072 |
| 1000985 | Mazen Hatim Karali | 62012 | 120 | 60207 | 10206 |
| 1002144 | Faisal  Hassan  Asiri | 62014 | 194 | 60129 | 10111 |
| 1002378 | Abdallah Tawfiq Alshay | - | 194 | - | 10111 |
| 1001759 | Abdullah Hesham Kaltho | 62014 | 190 | 60338 | 10200 |
| 1002078 | Nabel Abduljalil Fadhe | 60009 | 120 | 60394 | 10206 |
| 1000463 | Salem Mohamed Abdullat | 60009 | 120 | 60394 | 10206 |
| 1000633 | Mohamed Emad Tafesh | 62012 | 120 | 60394 | 10206 |
| 1000414 | Said Ali Said Ali | 62014 | 194 | 60129 | 10153 |
| 1002217 | Feras Mohammed  Bin Ra | 62014 | 194 | 60207 | 10153 |
| 1001799 | Abdulmalik  Yasir Jama | 62014 | 194 | 60207 | 10153 |
| 1000030 | Ashraf Mohamed Abdelaa | 60008 | 192 | 60344 | 10200 |
| 1000601 | Mhammed Abdalmajed Alj | 62012 | 120 | 60338 | 10206 |
| 1002405 | Charles  Salim  Ratl | 60010 | 196 | 60420 | 10081 |
| 1000389 | Tariq Tayseer Rafiq Al | 62014 | 194 | 60207 | 10153 |
| 1002437 | Ahmed  Abdelhakim  Els | 62014 | 194 | 60338 | 10153 |

### Pattern Analysis

#### Division: Fusion code → Manpower code(s)

- `585087` → {196}
- `60007` → {120, 888}
- `60008` → {192}
- `60009` → {120, 196}
- `60010` → {120, 196}
- `62011` → {170, 190, 194, 196}
- `62012` → {120}
- `62014` → {120, 190, 194}

#### Agency: Fusion code → Manpower code(s)

- `140003` → {10155, 10206}
- `60129` → {10111, 10153, 10206}
- `60133` → {10206}
- `60158` → {10126, 10200}
- `60207` → {10153, 10206}
- `60338` → {10072, 10082, 10083, 10100, 10113, 10126, 10153, 10156, 10200, 10206, 88888}
- `60339` → {10055}
- `60344` → {10005, 10200}
- `60348` → {10005}
- `60380` → {10156}
- `60382` → {10206}
- `60391` → {10052}
- `60394` → {10055, 10206}
- `60412` → {10206}
- `60420` → {10081}

#### Unique Fusion Solution codes observed

- `515084`
- `517090`
- `517091`
- `60015`
- `60024`
- `60026`
- `60030`
- `60032`
- `60034`
- `60036`
- `60037`
- `60050`
- `60059`
- `60066`
- `60085`
- `60089`
- `60092`

## Files Searched for Mapping

| File | Tab | Contains Fusion Codes? |
|------|-----|----------------------|
| master-data-003.xlsx | Manpower | NO — uses 3-digit DIV, 5-digit Agency, text Solution |
| master-data-003.xlsx | Account | NO — 8-digit GL accounts only |
| jawal-J26-640-resolved.xlsx | INDEX | NO — 8-digit GL accounts |
| jawal-J26-640-resolved.xlsx | Cost Center Segment | NO — 6-digit cost centers |
| jawal-J26-640-resolved.xlsx | DIV | NO — 3-digit DIV codes (100-888) |
| jawal-J26-640-resolved.xlsx | Agency | NO — 5-digit (10000-series) |
| jawal-J26-640-resolved.xlsx | Solution | NO — 5-digit (10000-series) |

**None of the existing master data files contain the Fusion-internal 5-digit codes**
(60010, 60338, 515084, etc.).

## Concrete Asks for Laith

1. **Division mapping table:** Fusion internal Division code (e.g., 60010, 62011, 62012, 62014)
   → Manpower 3-digit DIV code (e.g., 120, 170, 190, 192, 194, 196, 888).
   Where is this mapping maintained in Oracle Fusion?

2. **Agency mapping table:** Fusion internal Agency code (e.g., 60338, 60420, 60207, 60394)
   → Manpower 5-digit Agency code (e.g., 10072 Abbott, 10081 DIS).
   Is this in a Fusion lookup table?

3. **Solution mapping table:** Fusion internal Solution code (e.g., 515084, 60015, 60024, 60089)
   → Manpower 5-digit Solution code (e.g., 10017 CRM, 10050 HF).

4. **Export mechanism:** Can Laith/Labib export these lookup tables from Fusion as CSV/Excel?
   Ideally: a table with columns [FusionCode, ManpowerCode, Description] for each segment.

5. **Trip Cost For:** The form includes a `Trip Cost For` reference number (e.g., 300000685721225).
   Is this a Fusion internal cost-center ID? If so, can we get a mapping to the 6-digit CC?

## What We Can Do Without the Mapping

Even without the Fusion → Manpower mapping, the form gives us:
- **Employee Number** — direct match to Manpower (primary validation key)
- **Approver name** — cross-check against line manager in Manpower
- **Trip value, dates, route, perdiem class** — audit trail
- **Job title + grade** — detect employee changes not yet in Manpower
- **Relative consistency check** — same form-Division → same Manpower-DIV across batch

## Value of Mapping (If Obtained)

With the mapping, we can:
1. **Cross-validate Division/Agency/Solution** — if Fusion says Division=60010 and that maps
   to DIV=120, but Manpower says DIV=170 for this employee, flag the discrepancy
2. **Detect Manpower staleness** — employees who changed department in Fusion but Manpower
   hasn't been updated
3. **Auto-resolve allocation cases** — the form's Division/Agency/Solution may directly
   tell us where to post, even when Manpower says 'Need to allocate'