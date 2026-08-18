export interface SolventumPodFile {
  originalname: string;
  buffer: Buffer;
}

export interface SolventumPodLine {
  trx: string;
  itemDescription: string;
  manufacturer: string;
  lot: string;
  quantity: number;
  uom: string;
  sourceDoc: string;
  confidence: number;
}

export abstract class SolventumPodExtractor {
  abstract extract(file: SolventumPodFile): Promise<SolventumPodLine[]>;
}
