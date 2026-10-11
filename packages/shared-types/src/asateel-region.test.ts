import { describe, expect, it } from 'vitest';
import {
  ASATEEL_REGION_VALUES,
  asateelPipelineRegion,
  getAsateelRegionCode,
  getAsateelRegionFilePrefix,
  parseAsateelRegionFromFolderName,
} from './asateel-region';

describe('asateel region helpers', () => {
  it('lists the seven supplier areas as region values', () => {
    expect(ASATEEL_REGION_VALUES).toEqual([
      'CENTRAL',
      'PT_PROJECT',
      'EASTERN_OUTBOUND',
      'EASTERN_INBOUND',
      'WESTERN_OUTBOUND',
      'WESTERN_INBOUND',
      'MAIN',
    ]);
  });

  it('maps regions to Oracle codes', () => {
    expect(getAsateelRegionCode('CENTRAL')).toBe('20100');
    expect(getAsateelRegionCode('EASTERN_OUTBOUND')).toBe('30100');
    expect(getAsateelRegionCode('EASTERN_INBOUND')).toBe('30100');
    expect(getAsateelRegionCode('WESTERN_OUTBOUND')).toBe('40100');
    expect(getAsateelRegionCode('WESTERN_INBOUND')).toBe('40100');
    expect(getAsateelRegionCode('PT_PROJECT')).toBe('20100');
    expect(getAsateelRegionCode('MAIN')).toBe('20100');
  });

  it('maps regions to Oracle upload filename prefixes', () => {
    expect(getAsateelRegionFilePrefix('PT_PROJECT')).toBe('P&T');
    expect(getAsateelRegionFilePrefix('MAIN')).toBe('Main');
    expect(getAsateelRegionFilePrefix('EASTERN_INBOUND')).toBe('Eastern');
    expect(getAsateelRegionFilePrefix('WESTERN_OUTBOUND')).toBe('Western');
  });

  it('sends the engine the region it already understands', () => {
    expect(asateelPipelineRegion('EASTERN_INBOUND')).toBe('EASTERN');
    expect(asateelPipelineRegion('EASTERN_OUTBOUND')).toBe('EASTERN');
    expect(asateelPipelineRegion('WESTERN_INBOUND')).toBe('WESTERN');
    expect(asateelPipelineRegion('WESTERN_OUTBOUND')).toBe('WESTERN');
    expect(asateelPipelineRegion('CENTRAL')).toBe('CENTRAL');
    expect(asateelPipelineRegion('MAIN')).toBe('MAIN');
    expect(asateelPipelineRegion('PT_PROJECT')).toBe('PT_PROJECT');
  });

  it('parses region tokens from folder names', () => {
    expect(parseAsateelRegionFromFolderName('Batch-EASTERN-inbound-014')).toBe('EASTERN_INBOUND');
    expect(parseAsateelRegionFromFolderName('Batch-WESTERN-outbound-014')).toBe('WESTERN_OUTBOUND');
    expect(parseAsateelRegionFromFolderName('Batch-EASTERN-014')).toBeNull();
    expect(parseAsateelRegionFromFolderName('P&T invoices March')).toBe('PT_PROJECT');
    expect(parseAsateelRegionFromFolderName('legacy ADMIN folder')).toBe('MAIN');
  });
});
