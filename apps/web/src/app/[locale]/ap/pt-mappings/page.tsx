'use client';

import { Button } from '@aljeel/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, History, Plus, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { RequireAuth } from '@/components/require-auth';
import { RequireRole } from '@/components/require-role';
import {
  deletePtAgency,
  deletePtLineHead,
  deletePtSalesman,
  importPtMappings,
  listPtMappings,
  savePtAgency,
  savePtLineHead,
  savePtSalesman,
  type PtAgency,
  type PtSalesman,
} from '@/lib/pt-mappings-api';

const inputClass = 'w-full rounded-md border bg-background px-2 py-1 text-sm';

function AgencyRow({
  row,
  refresh,
  report,
}: {
  row: PtAgency;
  refresh: () => void;
  report: (warnings: string[]) => void;
}) {
  const t = useTranslations('ptMappings');
  const [form, setForm] = useState(row);
  useEffect(() => setForm(row), [row]);
  const save = useMutation({
    mutationFn: () => savePtAgency(row.id, form),
    onSuccess: (value) => {
      report(value.warnings);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: () => deletePtAgency(row.id), onSuccess: refresh });
  return (
    <tr className="border-t">
      <td className="p-2">
        <input
          className={inputClass}
          value={form.agencyName}
          onChange={(e) => setForm({ ...form, agencyName: e.target.value })}
        />
      </td>
      <td className="p-2">
        <input
          className={inputClass}
          value={form.managerName ?? ''}
          onChange={(e) => setForm({ ...form, managerName: e.target.value })}
        />
      </td>
      <td className="p-2">
        <input
          className={inputClass}
          value={form.managerEmpNo ?? ''}
          onChange={(e) => setForm({ ...form, managerEmpNo: e.target.value })}
        />
      </td>
      <td className="p-2 font-mono text-sm">{row.agencyCode}</td>
      <td className="p-2">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {t('save')}
        </Button>
      </td>
      <td className="p-2">
        <button
          aria-label={t('delete')}
          onClick={() => confirm(t('confirmDelete')) && remove.mutate()}
        >
          <Trash2 className="h-4 w-4 text-red-600" />
        </button>
      </td>
    </tr>
  );
}

function SalesmanRow({
  agency,
  row,
  refresh,
  report,
}: {
  agency: PtAgency;
  row: PtSalesman;
  refresh: () => void;
  report: (warnings: string[]) => void;
}) {
  const t = useTranslations('ptMappings');
  const [form, setForm] = useState(row);
  useEffect(() => setForm(row), [row]);
  const save = useMutation({
    mutationFn: () => savePtSalesman(agency.id, row.id, form),
    onSuccess: (value) => {
      report(value.warnings);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: () => deletePtSalesman(row.id), onSuccess: refresh });
  return (
    <tr className="border-t">
      {(['lineHeadName', 'lineHeadEmpNo', 'salesmanName', 'salesmanEmpNo'] as const).map(
        (field) => (
          <td className="p-2" key={field}>
            <input
              className={inputClass}
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
            />
          </td>
        ),
      )}
      <td className="p-2">
        <Button size="sm" onClick={() => save.mutate()}>
          {t('save')}
        </Button>
      </td>
      <td className="p-2">
        <button
          aria-label={t('delete')}
          onClick={() => confirm(t('confirmDelete')) && remove.mutate()}
        >
          <Trash2 className="h-4 w-4 text-red-600" />
        </button>
      </td>
    </tr>
  );
}

function Content() {
  const t = useTranslations('ptMappings');
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['pt-mappings'], queryFn: listPtMappings });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<{ file: File; diff: unknown } | null>(null);
  const refresh = () => void client.invalidateQueries({ queryKey: ['pt-mappings'] });
  const bmx = query.data?.agencies.find((row) => row.resolutionMode === 'SALESMAN');
  const action = async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    }
  };
  const addAgency = () =>
    action(async () => {
      const agencyName = prompt(t('newAgencyName'));
      if (!agencyName) return;
      const managerEmpNo = prompt(t('newManagerEmpNo'));
      if (!managerEmpNo) return;
      const value = await savePtAgency(null, {
        agencyName,
        managerName: '',
        managerEmpNo,
        resolutionMode: 'AGENCY',
      });
      setWarnings(value.warnings);
      refresh();
    });
  const addSalesman = () =>
    action(async () => {
      if (!bmx) return;
      const lineHeadEmpNo = prompt(t('newHeadEmpNo'));
      if (!lineHeadEmpNo) return;
      const salesmanEmpNo = prompt(t('newSalesmanEmpNo'));
      if (!salesmanEmpNo) return;
      const value = await savePtSalesman(bmx.id, null, {
        lineHeadName: '',
        lineHeadEmpNo,
        salesmanName: '',
        salesmanEmpNo,
      });
      setWarnings(value.warnings);
      refresh();
    });
  const selectFile = (file?: File) =>
    action(async () => {
      if (!file) return;
      const result = await importPtMappings(file, false);
      if ('diff' in result) setPreview({ file, diff: result.diff });
    });
  const apply = () =>
    action(async () => {
      if (!preview) return;
      const result = await importPtMappings(preview.file, true);
      if ('warnings' in result) setWarnings(result.warnings);
      setPreview(null);
      refresh();
    });
  const editHead = (empNo: string, currentName: string) =>
    action(async () => {
      if (!bmx) return;
      const lineHeadEmpNo = prompt(t('newHeadEmpNo'), empNo);
      if (!lineHeadEmpNo) return;
      const value = await savePtLineHead(bmx.id, empNo, {
        lineHeadName: currentName,
        lineHeadEmpNo,
      });
      setWarnings(value.warnings);
      refresh();
    });
  const removeHead = (empNo: string) =>
    action(async () => {
      if (!bmx || !confirm(t('confirmDeleteHead'))) return;
      const value = await deletePtLineHead(bmx.id, empNo);
      setWarnings(value.warnings);
      refresh();
    });
  const groups = bmx
    ? Object.entries(
        bmx.salesmen.reduce<Record<string, PtSalesman[]>>((all, row) => {
          const key = `${row.lineHeadEmpNo}|${row.lineHeadName}`;
          (all[key] ??= []).push(row);
          return all;
        }, {}),
      )
    : [];

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Upload className="h-4 w-4" />
          {t('import')}
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => void selectFile(e.target.files?.[0])}
          />
        </label>
      </div>
      {error && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <strong>{t('warnings')}</strong>
          <ul className="list-disc ps-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {preview && (
        <div className="mt-4 rounded-md border bg-card p-4">
          <h2 className="font-semibold">{t('preview')}</h2>
          <pre className="mt-2 max-h-64 overflow-auto text-xs">
            {JSON.stringify(preview.diff, null, 2)}
          </pre>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void apply()}>{t('apply')}</Button>
            <Button variant="outline" onClick={() => setPreview(null)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('agencies')}</h2>
          <Button size="sm" onClick={() => void addAgency()}>
            <Plus className="me-1 h-4 w-4" />
            {t('addAgency')}
          </Button>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[850px] text-start">
            <thead>
              <tr>
                {['agencyName', 'managerName', 'managerEmpNo', 'agencyCode', 'actions', ''].map(
                  (x) => (
                    <th className="p-2 text-start text-sm" key={x}>
                      {x ? t(x) : ''}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {query.data?.agencies
                .filter((a) => a.resolutionMode === 'AGENCY')
                .map((row) => (
                  <AgencyRow key={row.id} row={row} refresh={refresh} report={setWarnings} />
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('salesmanMode')}</h2>
          <Button size="sm" onClick={() => void addSalesman()}>
            <Plus className="me-1 h-4 w-4" />
            {t('addSalesman')}
          </Button>
        </div>
        <div className="mt-3 space-y-3">
          {groups.map(([key, rows]) => {
            const list = rows ?? [];
            const [empNo, name] = key.split('|');
            const open = expanded[key] ?? true;
            return (
              <div className="rounded-xl border bg-card" key={key}>
                <div className="flex items-center justify-between">
                  <button
                    className="flex flex-1 items-center gap-2 p-3 text-start font-medium"
                    onClick={() => setExpanded({ ...expanded, [key]: !open })}
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    {name} <span className="font-mono text-sm text-muted-foreground">{empNo}</span>
                  </button>
                  <div className="flex gap-2 pe-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void editHead(empNo!, name!)}
                    >
                      {t('editHead')}
                    </Button>
                    <button aria-label={t('delete')} onClick={() => void removeHead(empNo!)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </button>
                  </div>
                </div>
                {open && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                      <thead>
                        <tr>
                          {[
                            'lineHeadName',
                            'lineHeadEmpNo',
                            'salesmanName',
                            'salesmanEmpNo',
                            'actions',
                            '',
                          ].map((x) => (
                            <th className="p-2 text-start text-sm" key={x}>
                              {x ? t(x) : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((row) => (
                          <SalesmanRow
                            key={row.id}
                            agency={bmx!}
                            row={row}
                            refresh={refresh}
                            report={setWarnings}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <History className="h-5 w-5" />
          {t('history')}
        </h2>
        <div className="mt-3 max-h-72 overflow-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <tbody>
              {query.data?.audit.map((event) => (
                <tr className="border-t" key={event.id}>
                  <td className="p-2">{new Date(event.createdAt).toLocaleString()}</td>
                  <td className="p-2">{event.actorEmail}</td>
                  <td className="p-2">{event.action}</td>
                  <td className="p-2">
                    {event.entityType}.{event.field}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

export default function PtMappingsPage() {
  return (
    <RequireAuth>
      <RequireRole roles={['AP_CLERK']}>
        <Content />
      </RequireRole>
    </RequireAuth>
  );
}
