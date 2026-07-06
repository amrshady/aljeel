import { describe, expect, it } from 'vitest';
import {
  getAsateelRegionCode,
  getAsateelRegionFilePrefix,
  parseAsateelRegionFromFolderName,
} from './asateel-region';

describe('asateel region helpers', () => {
  it('maps regions to Oracle codes', () => {
    expect(getAsateelRegionCode('CENTRAL')).toBe('20100');
    expect(getAsateelRegionCode('EASTERN')).toBe('30100');
    expect(getAsateelRegionCode('WESTERN')).toBe('40100');
    expect(getAsateelRegionCode('PT_PROJECT')).toBe('20100');
    expect(getAsateelRegionCode('MAIN')).toBe('20100');
  });

  it('maps regions to Oracle upload filename prefixes', () => {
    expect(getAsateelRegionFilePrefix('PT_PROJECT')).toBe('P&T');
    expect(getAsateelRegionFilePrefix('MAIN')).toBe('Main');
  });

  it('parses region tokens from folder names', () => {
    expect(parseAsateelRegionFromFolderName('Batch-EASTERN-014')).toBe('EASTERN');
    expect(parseAsateelRegionFromFolderName('P&T invoices March')).toBe('PT_PROJECT');
    expect(parseAsateelRegionFromFolderName('legacy ADMIN folder')).toBe('MAIN');
  });
});
