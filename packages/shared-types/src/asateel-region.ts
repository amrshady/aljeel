import { z } from 'zod';

export const ASATEEL_REGION_VALUES = [
  'CENTRAL',
  'EASTERN',
  'WESTERN',
  'PT_PROJECT',
  'MAIN',
] as const;

export const AsateelRegionSchema = z.enum(ASATEEL_REGION_VALUES);
export type AsateelRegion = z.infer<typeof AsateelRegionSchema>;

/** Oracle / pipeline region codes shown beside each Asateel region option. */
export const ASATEEL_REGION_CODES: Record<AsateelRegion, string> = {
  CENTRAL: '20100',
  EASTERN: '30100',
  WESTERN: '40100',
  PT_PROJECT: '20100',
  MAIN: '20100',
};

/** Human-readable prefix used in Asateel Oracle upload filenames. */
export const ASATEEL_REGION_FILE_PREFIXES: Record<AsateelRegion, string> = {
  CENTRAL: 'Central',
  EASTERN: 'Eastern',
  WESTERN: 'Western',
  PT_PROJECT: 'P&T',
  MAIN: 'Main',
};

export function getAsateelRegionCode(region: AsateelRegion): string {
  return ASATEEL_REGION_CODES[region];
}

export function getAsateelRegionFilePrefix(region: AsateelRegion): string {
  return ASATEEL_REGION_FILE_PREFIXES[region];
}

/** Match region tokens embedded in uploaded folder names (case-insensitive). */
export function parseAsateelRegionFromFolderName(folderName: string): AsateelRegion | null {
  const matches = new Set<AsateelRegion>();
  const upper = folderName.toUpperCase();

  if (/\bCENTRAL\b/.test(upper)) matches.add('CENTRAL');
  if (/\bEASTERN\b/.test(upper)) matches.add('EASTERN');
  if (/\bWESTERN\b/.test(upper)) matches.add('WESTERN');
  if (/\bP\s*&\s*T\b/.test(folderName) || /\bPT_PROJECT\b/i.test(folderName) || /\bPROJECT\b/.test(upper)) {
    matches.add('PT_PROJECT');
  }
  if (/\bMAIN\b/.test(upper) || /\bADMIN\b/.test(upper)) matches.add('MAIN');

  return matches.size === 1 ? [...matches][0]! : null;
}
