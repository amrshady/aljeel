import { z } from 'zod';

export const ASATEEL_REGION_VALUES = [
  'CENTRAL',
  'PT_PROJECT',
  'EASTERN_OUTBOUND',
  'EASTERN_INBOUND',
  'WESTERN_OUTBOUND',
  'WESTERN_INBOUND',
  'MAIN',
] as const;

export const AsateelRegionSchema = z.enum(ASATEEL_REGION_VALUES);
export type AsateelRegion = z.infer<typeof AsateelRegionSchema>;

/** Region string the Asateel engine already accepts. */
export type AsateelPipelineRegion = 'CENTRAL' | 'EASTERN' | 'WESTERN' | 'PT_PROJECT' | 'MAIN';

/** Oracle / pipeline region codes shown beside each Asateel region option. */
export const ASATEEL_REGION_CODES: Record<AsateelRegion, string> = {
  CENTRAL: '20100',
  PT_PROJECT: '20100',
  EASTERN_OUTBOUND: '30100',
  EASTERN_INBOUND: '30100',
  WESTERN_OUTBOUND: '40100',
  WESTERN_INBOUND: '40100',
  MAIN: '20100',
};

/** Human-readable prefix used in Asateel Oracle upload filenames. */
export const ASATEEL_REGION_FILE_PREFIXES: Record<AsateelRegion, string> = {
  CENTRAL: 'Central',
  PT_PROJECT: 'P&T',
  EASTERN_OUTBOUND: 'Eastern',
  EASTERN_INBOUND: 'Eastern',
  WESTERN_OUTBOUND: 'Western',
  WESTERN_INBOUND: 'Western',
  MAIN: 'Main',
};

export function getAsateelRegionCode(region: AsateelRegion): string {
  return ASATEEL_REGION_CODES[region];
}

export function getAsateelRegionFilePrefix(region: AsateelRegion): string {
  return ASATEEL_REGION_FILE_PREFIXES[region];
}

/** Collapse an inbound or outbound area to the region the engine and Oracle files use. */
export function asateelPipelineRegion(region: AsateelRegion): AsateelPipelineRegion {
  if (region === 'EASTERN_INBOUND' || region === 'EASTERN_OUTBOUND') return 'EASTERN';
  if (region === 'WESTERN_INBOUND' || region === 'WESTERN_OUTBOUND') return 'WESTERN';
  return region;
}

/** Match region tokens embedded in uploaded folder names (case-insensitive). */
export function parseAsateelRegionFromFolderName(folderName: string): AsateelRegion | null {
  const matches = new Set<AsateelRegion>();
  const upper = folderName.toUpperCase();
  const inbound = /\bINBOUND\b/.test(upper);
  const outbound = /\bOUTBOUND\b/.test(upper);

  if (/\bCENTRAL\b/.test(upper)) matches.add('CENTRAL');
  if (/\bEASTERN\b/.test(upper)) {
    if (inbound && !outbound) matches.add('EASTERN_INBOUND');
    else if (outbound && !inbound) matches.add('EASTERN_OUTBOUND');
  }
  if (/\bWESTERN\b/.test(upper)) {
    if (inbound && !outbound) matches.add('WESTERN_INBOUND');
    else if (outbound && !inbound) matches.add('WESTERN_OUTBOUND');
  }
  if (
    /\bP\s*&\s*T\b/.test(folderName) ||
    /\bPT_PROJECT\b/i.test(folderName) ||
    /\bPROJECT\b/.test(upper)
  ) {
    matches.add('PT_PROJECT');
  }
  if (/\bMAIN\b/.test(upper) || /\bADMIN\b/.test(upper)) matches.add('MAIN');

  return matches.size === 1 ? [...matches][0]! : null;
}
