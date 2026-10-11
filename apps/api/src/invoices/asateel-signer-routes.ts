import type { AsateelRegion } from '@aljeel/shared-types';

export const ASATEEL_SIGNER_ROUTES: Array<{
  id: string;
  region: AsateelRegion | null;
  stage: 1 | 2;
  signerEmail: string;
}> = [
  {
    id: 'asateel_route_central_outbound',
    region: 'CENTRAL',
    stage: 1,
    signerEmail: 'wkobessy@aljeel.com',
  },
  {
    id: 'asateel_route_pt_outbound',
    region: 'PT_PROJECT',
    stage: 1,
    signerEmail: 'wkobessy@aljeel.com',
  },
  {
    id: 'asateel_route_eastern_outbound',
    region: 'EASTERN_OUTBOUND',
    stage: 1,
    signerEmail: 'wkobessy@aljeel.com',
  },
  {
    id: 'asateel_route_eastern_inbound',
    region: 'EASTERN_INBOUND',
    stage: 1,
    signerEmail: 'sshaik@aljeel.com',
  },
  {
    id: 'asateel_route_western_outbound',
    region: 'WESTERN_OUTBOUND',
    stage: 1,
    signerEmail: 'wkobessy@aljeel.com',
  },
  {
    id: 'asateel_route_western_inbound',
    region: 'WESTERN_INBOUND',
    stage: 1,
    signerEmail: 'halghadeer@aljeel.com',
  },
  {
    id: 'asateel_route_main_inbound',
    region: 'MAIN',
    stage: 1,
    signerEmail: 'rabdelshafy@aljeel.com',
  },
  {
    id: 'asateel_route_stage2',
    region: null,
    stage: 2,
    signerEmail: 'agahmed@aljeel.com',
  },
];
