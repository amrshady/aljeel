import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PtAuditAction, PtResolutionMode } from '@prisma/client';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

export interface PtUploadedFile {
  buffer: Buffer;
}
const agencyInput = z
  .object({
    agencyName: z.string().trim().min(1),
    managerName: z.string().trim().optional().nullable(),
    managerEmpNo: z.string().trim().optional().nullable(),
    resolutionMode: z.nativeEnum(PtResolutionMode),
  })
  .superRefine((value, ctx) => {
    if (value.resolutionMode === 'AGENCY' && !value.managerEmpNo) {
      ctx.addIssue({
        code: 'custom',
        message: 'Manager employee number is required for AGENCY mode',
      });
    }
  });
const salesmanInput = z.object({
  lineHeadName: z.string().trim().optional().default(''),
  lineHeadEmpNo: z.string().trim().min(1),
  salesmanName: z.string().trim().optional().default(''),
  salesmanEmpNo: z.string().trim().min(1),
});
type Tx = Prisma.TransactionClient;
type Snapshot = {
  agencies: Array<Record<string, unknown> & { salesmen: Record<string, unknown>[] }>;
};
type PythonResponse = {
  agencies?: Snapshot['agencies'];
  errors?: string[];
  warnings?: string[];
  validation?: { warnings?: string[] };
  [key: string]: unknown;
};

@Injectable()
export class PtMappingsService {
  private readonly script = resolve(process.cwd(), 'scripts/pt-mappings.py');
  private readonly lookup = resolve(
    process.cwd(),
    '../../../aljeel/pipelines/lookups/asateel_projects_labadi_v1.json',
  );

  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const [agencies, audit] = await Promise.all([
      this.prisma.ptAgencyMapping.findMany({
        include: { salesmen: { orderBy: [{ lineHeadEmpNo: 'asc' }, { salesmanEmpNo: 'asc' }] } },
        orderBy: { agencyCode: 'asc' },
      }),
      this.prisma.ptMappingAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return { scope: 'PROJECTS', mode: 'projects-labadi-v1', agencies, audit };
  }

  auditHistory() {
    return this.prisma.ptMappingAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async validate() {
    const snapshot = await this.snapshot(this.prisma);
    const result = await this.resolveRows(snapshot.agencies);
    return { valid: true, scope: 'PROJECTS', warnings: result.warnings };
  }

  regenerate(user: AuthUser) {
    return this.mutate(user, async (tx) => {
      await this.audit(tx, user, 'PtMappings', 'all', 'REGENERATE', 'artifact', null, {
        lookup: 'asateel_projects_labadi_v1.json',
      });
      return { regeneratedBy: user.id };
    });
  }

  resolve(body: unknown) {
    const value = agencyInput.parse(body);
    return this.python('resolve', { agencies: [{ ...value, salesmen: [] }] });
  }

  createAgency(user: AuthUser, body: unknown) {
    const value = agencyInput.parse(body);
    return this.mutate(user, async (tx) => {
      const resolved = await this.resolveRows([{ ...value, salesmen: [] }]);
      const row = resolved.agencies[0]!;
      const created = await tx.ptAgencyMapping.create({
        data: {
          agencyName: String(row.agencyName),
          managerName: row.managerName ? String(row.managerName) : null,
          managerEmpNo: row.managerEmpNo ? String(row.managerEmpNo) : null,
          resolutionMode: value.resolutionMode,
          agencyCode: String(row.agencyCode),
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
      await this.audit(tx, user, 'PtAgencyMapping', created.id, 'CREATE', 'row', null, created);
      return created;
    });
  }

  updateAgency(user: AuthUser, id: string, body: unknown) {
    const value = agencyInput.parse(body);
    return this.mutate(user, async (tx) => {
      const before = await tx.ptAgencyMapping.findUnique({
        where: { id },
        include: { salesmen: true },
      });
      if (!before) throw new NotFoundException('P&T agency mapping not found');
      const resolved = await this.resolveRows([{ ...value, salesmen: before.salesmen }]);
      const row = resolved.agencies[0]!;
      const after = await tx.ptAgencyMapping.update({
        where: { id },
        data: {
          agencyName: String(row.agencyName),
          managerName: row.managerName ? String(row.managerName) : null,
          managerEmpNo: row.managerEmpNo ? String(row.managerEmpNo) : null,
          resolutionMode: value.resolutionMode,
          agencyCode: String(row.agencyCode),
          updatedBy: user.id,
        },
      });
      await this.auditChanges(tx, user, 'PtAgencyMapping', id, before, after);
      return after;
    });
  }

  deleteAgency(user: AuthUser, id: string) {
    return this.mutate(user, async (tx) => {
      const before = await tx.ptAgencyMapping.findUnique({
        where: { id },
        include: { salesmen: true },
      });
      if (!before) throw new NotFoundException('P&T agency mapping not found');
      await tx.ptAgencyMapping.delete({ where: { id } });
      await this.audit(tx, user, 'PtAgencyMapping', id, 'DELETE', 'row', before, null);
      return { id };
    });
  }

  createSalesman(user: AuthUser, agencyId: string, body: unknown) {
    const value = salesmanInput.parse(body);
    return this.mutate(user, async (tx) => {
      const agency = await tx.ptAgencyMapping.findUnique({ where: { id: agencyId } });
      if (!agency || agency.resolutionMode !== 'SALESMAN')
        throw new BadRequestException('Salesmen require a SALESMAN-mode P&T agency');
      const resolved = await this.resolveRows([{ ...agency, salesmen: [value] }]);
      const row = resolved.agencies[0]!.salesmen[0]!;
      const created = await tx.ptSalesmanMapping.create({
        data: {
          agencyMappingId: agencyId,
          lineHeadName: String(row.lineHeadName),
          lineHeadEmpNo: String(row.lineHeadEmpNo),
          salesmanName: String(row.salesmanName),
          salesmanEmpNo: String(row.salesmanEmpNo),
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
      await this.audit(tx, user, 'PtSalesmanMapping', created.id, 'CREATE', 'row', null, created);
      return created;
    });
  }

  updateSalesman(user: AuthUser, id: string, body: unknown) {
    const value = salesmanInput.parse(body);
    return this.mutate(user, async (tx) => {
      const before = await tx.ptSalesmanMapping.findUnique({
        where: { id },
        include: { agencyMapping: true },
      });
      if (!before) throw new NotFoundException('P&T salesman mapping not found');
      const resolved = await this.resolveRows([{ ...before.agencyMapping, salesmen: [value] }]);
      const row = resolved.agencies[0]!.salesmen[0]!;
      const after = await tx.ptSalesmanMapping.update({
        where: { id },
        data: {
          lineHeadName: String(row.lineHeadName),
          lineHeadEmpNo: String(row.lineHeadEmpNo),
          salesmanName: String(row.salesmanName),
          salesmanEmpNo: String(row.salesmanEmpNo),
          updatedBy: user.id,
        },
      });
      await this.auditChanges(tx, user, 'PtSalesmanMapping', id, before, after);
      return after;
    });
  }

  deleteSalesman(user: AuthUser, id: string) {
    return this.mutate(user, async (tx) => {
      const before = await tx.ptSalesmanMapping.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('P&T salesman mapping not found');
      await tx.ptSalesmanMapping.delete({ where: { id } });
      await this.audit(tx, user, 'PtSalesmanMapping', id, 'DELETE', 'row', before, null);
      return { id };
    });
  }

  updateLineHead(user: AuthUser, agencyId: string, currentEmpNo: string, body: unknown) {
    const value = z
      .object({
        lineHeadName: z.string().trim().optional().default(''),
        lineHeadEmpNo: z.string().trim().min(1),
      })
      .parse(body);
    return this.mutate(user, async (tx) => {
      const rows = await tx.ptSalesmanMapping.findMany({
        where: { agencyMappingId: agencyId, lineHeadEmpNo: currentEmpNo },
      });
      const agency = await tx.ptAgencyMapping.findUnique({ where: { id: agencyId } });
      if (!agency || rows.length === 0) throw new NotFoundException('P&T line head not found');
      const candidate = rows.map((row) => ({ ...row, ...value }));
      const resolved = await this.resolveRows([{ ...agency, salesmen: candidate }]);
      const normalized = resolved.agencies[0]!.salesmen[0]!;
      await tx.ptSalesmanMapping.updateMany({
        where: { agencyMappingId: agencyId, lineHeadEmpNo: currentEmpNo },
        data: {
          lineHeadName: String(normalized.lineHeadName),
          lineHeadEmpNo: String(normalized.lineHeadEmpNo),
          updatedBy: user.id,
        },
      });
      await this.audit(
        tx,
        user,
        'PtLineHead',
        `${agencyId}:${currentEmpNo}`,
        'UPDATE',
        'row',
        { lineHeadEmpNo: currentEmpNo, lineHeadName: rows[0]!.lineHeadName },
        normalized,
      );
      return normalized;
    });
  }

  deleteLineHead(user: AuthUser, agencyId: string, empNo: string) {
    return this.mutate(user, async (tx) => {
      const rows = await tx.ptSalesmanMapping.findMany({
        where: { agencyMappingId: agencyId, lineHeadEmpNo: empNo },
      });
      if (rows.length === 0) throw new NotFoundException('P&T line head not found');
      await tx.ptSalesmanMapping.deleteMany({
        where: { agencyMappingId: agencyId, lineHeadEmpNo: empNo },
      });
      await this.audit(tx, user, 'PtLineHead', `${agencyId}:${empNo}`, 'DELETE', 'row', rows, null);
      return { agencyId, empNo };
    });
  }

  async previewImport(file?: PtUploadedFile) {
    if (!file) throw new BadRequestException('Book1-shaped .xlsx file is required');
    const candidate = await this.parseWorkbook(file.buffer);
    const resolved = await this.resolveRows(candidate.agencies);
    const current = await this.snapshot(this.prisma);
    return { candidate: resolved, diff: this.diff(current, { agencies: resolved.agencies }) };
  }

  async applyImport(user: AuthUser, file?: PtUploadedFile) {
    if (!file) throw new BadRequestException('Book1-shaped .xlsx file is required');
    const candidate = await this.parseWorkbook(file.buffer);
    return this.mutate(user, async (tx) => {
      const resolved = await this.resolveRows(candidate.agencies);
      const before = await this.snapshot(tx);
      await tx.ptSalesmanMapping.deleteMany();
      await tx.ptAgencyMapping.deleteMany();
      for (const agency of resolved.agencies) {
        await tx.ptAgencyMapping.create({
          data: {
            agencyName: String(agency.agencyName),
            agencyCode: String(agency.agencyCode),
            managerName: agency.managerName ? String(agency.managerName) : null,
            managerEmpNo: agency.managerEmpNo ? String(agency.managerEmpNo) : null,
            resolutionMode: agency.resolutionMode as PtResolutionMode,
            createdBy: user.id,
            updatedBy: user.id,
            salesmen: {
              create: agency.salesmen.map((row) => ({
                lineHeadName: String(row.lineHeadName),
                lineHeadEmpNo: String(row.lineHeadEmpNo),
                salesmanName: String(row.salesmanName),
                salesmanEmpNo: String(row.salesmanEmpNo),
                createdBy: user.id,
                updatedBy: user.id,
              })),
            },
          },
        });
      }
      await this.audit(tx, user, 'PtMappings', 'all', 'IMPORT', 'rows', before, resolved);
      return { applied: true, diff: this.diff(before, { agencies: resolved.agencies }) };
    });
  }

  private async mutate<T>(user: AuthUser, change: (tx: Tx) => Promise<T>) {
    const previous = await readFile(this.lookup);
    let artifactChanged = false;
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const value = await change(tx);
          const snapshot = await this.snapshot(tx);
          const temp = await mkdtemp(resolve(tmpdir(), 'pt-lookup-'));
          const candidate = resolve(temp, 'lookup.json');
          try {
            const built = await this.python('build', snapshot, candidate);
            await rename(candidate, this.lookup);
            artifactChanged = true;
            return { data: value, warnings: built.validation?.warnings ?? [] };
          } finally {
            await rm(temp, { recursive: true, force: true });
          }
        },
        { timeout: 30_000 },
      );
      return { ...result, scope: 'PROJECTS', regenerated: true };
    } catch (error) {
      if (artifactChanged) await writeFile(this.lookup, previous);
      if (error instanceof z.ZodError) throw new BadRequestException(error.flatten());
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      throw new BadRequestException(
        error instanceof Error ? error.message : 'P&T mapping save failed',
      );
    }
  }

  private async snapshot(db: Pick<PrismaService, 'ptAgencyMapping'> | Tx): Promise<Snapshot> {
    const agencies = await db.ptAgencyMapping.findMany({
      include: { salesmen: { orderBy: [{ lineHeadEmpNo: 'asc' }, { salesmanEmpNo: 'asc' }] } },
      orderBy: [{ agencyCode: 'asc' }],
    });
    return { agencies };
  }

  private async python(
    command: 'resolve' | 'build',
    payload: unknown,
    output?: string,
  ): Promise<PythonResponse> {
    const args = [this.script, command, ...(output ? ['--output', output] : [])];
    return new Promise((resolvePromise, reject) => {
      const child = spawn('python3', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (status) => {
        if (status !== 0)
          reject(new BadRequestException(stderr.trim() || 'Python P&T resolver failed'));
        else {
          try {
            resolvePromise(JSON.parse(stdout));
          } catch {
            reject(new BadRequestException('Python P&T resolver returned invalid JSON'));
          }
        }
      });
      child.stdin.end(JSON.stringify(payload));
    });
  }

  private async resolveRows(agencies: Record<string, unknown>[]) {
    const result = await this.python('resolve', { agencies });
    if (result.errors?.length)
      throw new BadRequestException({
        message: 'P&T mapping validation failed',
        errors: result.errors,
      });
    return result as { agencies: Snapshot['agencies']; warnings: string[] };
  }

  private async parseWorkbook(buffer: Buffer): Promise<Snapshot> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    if (workbook.SheetNames.length !== 1 || workbook.SheetNames[0] !== 'Sheet1')
      throw new BadRequestException("Expected exactly one sheet named 'Sheet1'");
    const sheet = workbook.Sheets.Sheet1!;
    const cell = (address: string) =>
      String(sheet[address]?.v ?? '')
        .trim()
        .replace(/\.0$/, '');
    if (
      cell('F4') !== 'Agency' ||
      cell('G4') !== 'Manager' ||
      cell('H4') !== 'Employee NO' ||
      cell('F14') !== 'BMX'
    ) {
      throw new BadRequestException('Workbook is not Book1-shaped');
    }
    const agencies: Snapshot['agencies'] = [];
    for (let row = 5; row <= 12; row++)
      agencies.push({
        agencyName: cell(`F${row}`),
        managerName: cell(`G${row}`),
        managerEmpNo: cell(`H${row}`),
        resolutionMode: 'AGENCY',
        salesmen: [],
      });
    const salesmen: Record<string, unknown>[] = [];
    for (const headRow of [15, 19, 23]) {
      for (
        let column = 9;
        column <= XLSX.utils.decode_range(sheet['!ref'] ?? 'A1').e.c + 1;
        column++
      ) {
        const letter = XLSX.utils.encode_col(column - 1);
        const salesmanName = cell(`${letter}${headRow + 1}`);
        const salesmanEmpNo = cell(`${letter}${headRow + 2}`);
        if (salesmanName || salesmanEmpNo)
          salesmen.push({
            lineHeadName: cell(`H${headRow}`),
            lineHeadEmpNo: cell(`I${headRow}`),
            salesmanName,
            salesmanEmpNo,
          });
      }
    }
    agencies.push({
      agencyName: 'BMX',
      managerName: null,
      managerEmpNo: null,
      resolutionMode: 'SALESMAN',
      salesmen,
    });
    return { agencies };
  }

  private diff(before: Snapshot, after: Snapshot) {
    const compact = (value: Snapshot) =>
      value.agencies.map((a) => ({
        agencyName: a.agencyName,
        managerName: a.managerName,
        managerEmpNo: a.managerEmpNo,
        resolutionMode: a.resolutionMode,
        agencyCode: a.agencyCode,
        salesmen: a.salesmen.map((s) => ({
          lineHeadName: s.lineHeadName,
          lineHeadEmpNo: s.lineHeadEmpNo,
          salesmanName: s.salesmanName,
          salesmanEmpNo: s.salesmanEmpNo,
        })),
      }));
    return { before: compact(before), after: compact(after) };
  }

  private audit(
    tx: Tx,
    user: AuthUser,
    entityType: string,
    entityId: string,
    action: PtAuditAction,
    field: string,
    oldValue: unknown,
    newValue: unknown,
  ) {
    return tx.ptMappingAudit.create({
      data: {
        entityType,
        entityId,
        action,
        field,
        oldValue: oldValue === null ? Prisma.JsonNull : (oldValue as Prisma.InputJsonValue),
        newValue: newValue === null ? Prisma.JsonNull : (newValue as Prisma.InputJsonValue),
        actorId: user.id,
        actorEmail: user.email,
      },
    });
  }

  private async auditChanges(
    tx: Tx,
    user: AuthUser,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    const beforeRecord = before as Record<string, unknown>;
    const afterRecord = after as Record<string, unknown>;
    for (const field of Object.keys(afterRecord)) {
      if (['updatedAt', 'createdAt'].includes(field)) continue;
      if (JSON.stringify(beforeRecord[field]) !== JSON.stringify(afterRecord[field])) {
        await this.audit(
          tx,
          user,
          entityType,
          entityId,
          'UPDATE',
          field,
          beforeRecord[field] ?? null,
          afterRecord[field] ?? null,
        );
      }
    }
  }
}
