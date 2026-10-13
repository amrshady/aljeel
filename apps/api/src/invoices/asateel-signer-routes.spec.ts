import { ASATEEL_REGION_VALUES } from '@aljeel/shared-types';
import { describe, expect, it } from 'vitest';
import { ASATEEL_SIGNER_ROUTES } from './asateel-signer-routes';

const STAGE1 = {
  CENTRAL: 'wkobessy@aljeel.com',
  PT_PROJECT: 'wkobessy@aljeel.com',
  EASTERN_OUTBOUND: 'wkobessy@aljeel.com',
  EASTERN_INBOUND: 'halghadeer@aljeel.com',
  WESTERN_OUTBOUND: 'wkobessy@aljeel.com',
  WESTERN_INBOUND: 'sshaik@aljeel.com',
  MAIN: 'rabdelshafy@aljeel.com',
} as const;

describe('Asateel signer routes', () => {
  it('gives every region a stage 1 signer and Abdul Ghaffar stage 2', () => {
    expect(ASATEEL_REGION_VALUES).toHaveLength(7);
    const stage1 = ASATEEL_SIGNER_ROUTES.filter((route) => route.stage === 1);
    expect(stage1).toHaveLength(ASATEEL_REGION_VALUES.length);
    for (const region of ASATEEL_REGION_VALUES) {
      expect(stage1.find((route) => route.region === region)?.signerEmail).toBe(STAGE1[region]);
    }
    expect(ASATEEL_SIGNER_ROUTES.filter((route) => route.stage === 2)).toEqual([
      {
        id: 'asateel_route_stage2',
        region: null,
        stage: 2,
        signerEmail: 'agahmed@aljeel.com',
      },
    ]);
  });
});
