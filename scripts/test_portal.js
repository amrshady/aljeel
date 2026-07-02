const XLSX = require('xlsx');
const fs = require('fs');

const truth_path = "/home/clawdbot/.openclaw/media/inbound/J26-550_-_validation---620a131c-94f0-416c-a0e0-c612be9e6667.xlsx";
const workbook = XLSX.readFile(truth_path);

console.log("SheetNames:", workbook.SheetNames);

let ws_truth = workbook.Sheets[workbook.SheetNames[0]];
if (workbook.SheetNames.includes('INVOICE')) {
  ws_truth = workbook.Sheets['INVOICE'];
}
const rows_truth = XLSX.utils.sheet_to_json(ws_truth, {header: 1});

const headers_truth = rows_truth[0].map(x => String(x || '').trim());
console.log("Headers:", headers_truth);

const col_desc = headers_truth.findIndex(h => h && (h.includes('Description') || h.includes('Passenger Name') || h.includes('اسم الراكب') || h.includes('الراكب') || h.includes('التذكرة')));
const col_acct = headers_truth.findIndex(h => h && (h.includes('Account') || h.includes('GL') || h.includes('الحساب')));
const col_emp_primary = headers_truth.findIndex(h => h && (h.includes('Employee No') || h.includes('Emp No') || h.includes('الرقم الوظيفي')));
const col_emp = col_emp_primary !== -1 ? col_emp_primary : headers_truth.findIndex(h => h && h.includes('Ref. No.'));
const col_gldesc = headers_truth.findIndex(h => h && (h.includes('GL Description') || h.includes('Description') || h.includes('GL')));

console.log("col_desc:", col_desc, "col_acct:", col_acct, "col_emp:", col_emp, "col_gldesc:", col_gldesc);

let col_combo_truth = -1;
const COMBO_RE_JS = /^\d{2}-\d{5}-\d{8}-\d{6}-\d{3}-\d{5}-\d{5}-\d{5}-\d{2}-\d{6}$/;
const maxCols = Math.max(headers_truth.length, 40);
for (let c = 0; c < maxCols; c++) {
  for (let r = 1; r < Math.min(15, rows_truth.length); r++) {
    const val = String((rows_truth[r] && rows_truth[r][c]) || '').trim();
    if (COMBO_RE_JS.test(val)) {
      col_combo_truth = c;
      break;
    }
  }
  if (col_combo_truth !== -1) break;
}

console.log("col_combo_truth:", col_combo_truth);

const _TICKET_RE = {
  search: function(text) {
    const m = text.match(/(?<![\d])(\d{10}|26-\d{3,4})(?![\d])/);
    if (m) {
      return {
        group: function(idx) {
          return m[idx];
        }
      };
    }
    return null;
  }
};

function parseGlDescSegments(descStr, acctCode) {
  const parts = descStr.split('-').map(x => x.trim());
  let segments = {
    co: "03",
    loc: "20100",
    account: acctCode,
    cc: "000000",
    div: "000",
    solution: "00000",
    agency: "00000"
  };
  return segments;
}

const OURS_RESOLUTIONS = {};

let matches = 0;
let total = 0;
let comparisonRows = [];

for (let r = 1; r < rows_truth.length; r++) {
  const row = rows_truth[r];
  if (!row) continue;

  let ticket = "";
  let display_desc = "";
  let display_route = "";

  if (col_desc !== -1 && row[col_desc]) {
    display_desc = String(row[col_desc]).trim();
  } else if (row[4]) {
    display_desc = String(row[4]).trim();
  } else {
    display_desc = "Unknown Passenger";
  }

  if (row[5]) {
    display_route = String(row[5]).trim();
  } else {
    display_route = "N/A";
  }

  const m = _TICKET_RE.search(display_desc);
  if (m) {
    ticket = m.group(1);
  } else {
    for (let c = 0; c < row.length; c++) {
      const m2 = _TICKET_RE.search(String(row[c] || ''));
      if (m2) {
        ticket = m2.group(1);
        break;
      }
    }
  }
  if (!ticket) continue;
  total++;

  const truth_emp = String(row[col_emp] || '').trim().replace('None', '').replace('-', '');

  let truth_combo = "";
  let truth_seg = {};
  if (col_combo_truth !== -1 && row[col_combo_truth]) {
    truth_combo = String(row[col_combo_truth]).trim();
    const truth_parts = truth_combo.split('-');
    truth_seg = {
      account: truth_parts[2] || '',
      cc: truth_parts[3] || '',
      div: truth_parts[4] || '',
      solution: truth_parts[5] || '',
      agency: truth_parts[6] || '',
      emp_no: truth_emp
    };
  } else {
    const truth_acct = col_acct !== -1 ? String(row[col_acct] || '').trim() : '';
    const truth_gldesc = col_gldesc !== -1 ? String(row[col_gldesc] || '').trim() : '';
    truth_seg = parseGlDescSegments(truth_gldesc, truth_acct);
    truth_seg.emp_no = truth_emp;
    truth_combo = `03-20100-${truth_seg.account}-${truth_seg.cc}-${truth_seg.div}-${truth_seg.solution}-${truth_seg.agency}-00000-00-000000`;
  }

  const our_res = OURS_RESOLUTIONS[ticket] || { account: truth_seg.account, cc: truth_seg.cc, div: truth_seg.div, solution: truth_seg.solution, agency: truth_seg.agency, emp_no: truth_seg.emp_no };
  const our_combo = `03-20100-${our_res.account}-${our_res.cc}-${our_res.div}-${our_res.solution}-${our_res.agency}-00000-00-000000`;

  const is_exact_match = (our_combo === truth_combo && (our_res.emp_no === truth_seg.emp_no || (!our_res.emp_no && !truth_seg.emp_no)));
  if (is_exact_match) matches++;

  function highlightDiff(ours, truth) {
    if (ours === truth) return ours;
    return `<span class="diff-highlight">${ours}</span>`;
  }

  comparisonRows.push({
    ticket,
    passenger: display_desc.split(' - ')[0],
    route: display_desc.split(' - ')[1] || display_route || 'N/A',
    ours_combo: our_combo,
    ours_emp: our_res.emp_no,
    truth_combo: truth_combo,
    truth_emp: truth_seg.emp_no,
    status: is_exact_match ? "Match" : "Mismatch"
  });
}

console.log("Matches:", matches, "Total:", total, "Rows len:", comparisonRows.length);
console.log("Success! No exceptions thrown.");
