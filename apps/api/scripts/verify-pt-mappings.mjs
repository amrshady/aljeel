import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const lookupPath = resolve(process.cwd(), '../../../aljeel/pipelines/lookups/asateel_projects_labadi_v1.json');
const lookup = JSON.parse(readFileSync(lookupPath, 'utf8'));
const agencies = lookup.agency_rules.map((rule) => ({
  agencyName: rule.agency_name,
  agencyCode: rule.agency_code,
  managerName: rule.manager?.employee_name ?? null,
  managerEmpNo: rule.manager?.employee_no ?? null,
  resolutionMode: rule.employee_strategy === 'agency_manager' ? 'AGENCY' : 'SALESMAN',
  salesmen: (rule.heads ?? []).flatMap((head) => head.juniors.map((junior) => ({
    lineHeadName: head.employee_name,
    lineHeadEmpNo: head.employee_no,
    salesmanName: junior.employee_name,
    salesmanEmpNo: junior.employee_no,
  }))),
}));
const temp = mkdtempSync(resolve(tmpdir(), 'pt-verify-'));
const output = resolve(temp, 'lookup.json');
try {
  const run = spawnSync('python3', [resolve(process.cwd(), 'scripts/pt-mappings.py'), 'build', '--output', output], {
    input: JSON.stringify({ agencies }), encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(run.stderr);
  const generatedBytes = readFileSync(output);
  const generated = JSON.parse(generatedBytes.toString('utf8'));
  const comparable = (value) => ({
    ...value,
    provenance: undefined,
    agency_rules: value.agency_rules.map((rule) => ({
      ...rule,
      source_cells: undefined,
      heads: rule.heads?.map((head) => ({
        ...head,
        source_cells: undefined,
        juniors: head.juniors.map((junior) => ({ ...junior, source_cells: undefined })),
      })),
    })),
  });
  if (JSON.stringify(comparable(generated)) !== JSON.stringify(comparable(lookup))) {
    throw new Error('Seed regeneration is not structurally compatible with the existing lookup');
  }
  if (!generatedBytes.toString('utf8').endsWith('\n') || generatedBytes.toString('utf8').includes('\r\n')) {
    throw new Error('Generated lookup is not UTF-8 LF with a trailing newline');
  }
  console.log(`Verified ${generated.statistics.agency_rules} PROJECTS rules, ${generated.statistics.bmx_heads} heads, ${generated.statistics.bmx_junior_to_head_rules} salesmen.`);
  console.log('Pipeline load_lookup passed; seed structure matches apart from documented managed-table provenance/source locations.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
