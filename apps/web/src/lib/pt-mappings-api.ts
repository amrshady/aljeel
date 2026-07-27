import { z } from 'zod';
import { apiFetch } from './api-client';

export const PtSalesmanSchema = z.object({
  id: z.string(),
  lineHeadName: z.string(),
  lineHeadEmpNo: z.string(),
  salesmanName: z.string(),
  salesmanEmpNo: z.string(),
});
export const PtAgencySchema = z.object({
  id: z.string(),
  agencyName: z.string(),
  managerName: z.string().nullable(),
  managerEmpNo: z.string().nullable(),
  resolutionMode: z.enum(['AGENCY', 'SALESMAN']),
  agencyCode: z.string(),
  salesmen: z.array(PtSalesmanSchema),
});
const AuditSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  field: z.string(),
  actorEmail: z.string(),
  createdAt: z.string(),
});
const ListSchema = z.object({
  scope: z.literal('PROJECTS'),
  mode: z.literal('projects-labadi-v1'),
  agencies: z.array(PtAgencySchema),
  audit: z.array(AuditSchema),
});
const MutationSchema = z.object({
  data: z.unknown(),
  warnings: z.array(z.string()),
  scope: z.literal('PROJECTS'),
  regenerated: z.boolean(),
});
const PreviewSchema = z.object({
  candidate: z.unknown(),
  diff: z.object({ before: z.array(z.unknown()), after: z.array(z.unknown()) }),
});
export type PtAgency = z.infer<typeof PtAgencySchema>;
export type PtSalesman = z.infer<typeof PtSalesmanSchema>;

export const listPtMappings = () => apiFetch('/ap/pt-mappings', { schema: ListSchema });
export const savePtAgency = (id: string | null, body: unknown) =>
  apiFetch(id ? `/ap/pt-mappings/agencies/${id}` : '/ap/pt-mappings/agencies', {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
    schema: MutationSchema,
  });
export const deletePtAgency = (id: string) =>
  apiFetch(`/ap/pt-mappings/agencies/${id}`, { method: 'DELETE', schema: MutationSchema });
export const savePtSalesman = (agencyId: string, id: string | null, body: unknown) =>
  apiFetch(
    id ? `/ap/pt-mappings/salesmen/${id}` : `/ap/pt-mappings/agencies/${agencyId}/salesmen`,
    {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
      schema: MutationSchema,
    },
  );
export const deletePtSalesman = (id: string) =>
  apiFetch(`/ap/pt-mappings/salesmen/${id}`, { method: 'DELETE', schema: MutationSchema });
export const savePtLineHead = (agencyId: string, empNo: string, body: unknown) =>
  apiFetch(`/ap/pt-mappings/agencies/${agencyId}/line-heads/${empNo}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    schema: MutationSchema,
  });
export const deletePtLineHead = (agencyId: string, empNo: string) =>
  apiFetch(`/ap/pt-mappings/agencies/${agencyId}/line-heads/${empNo}`, {
    method: 'DELETE',
    schema: MutationSchema,
  });
export const importPtMappings = (file: File, apply: boolean) => {
  const body = new FormData();
  body.append('file', file);
  if (apply)
    return apiFetch('/ap/pt-mappings/import/apply', {
      method: 'POST',
      body,
      schema: MutationSchema,
    });
  return apiFetch('/ap/pt-mappings/import/preview', {
    method: 'POST',
    body,
    schema: PreviewSchema,
  });
};
