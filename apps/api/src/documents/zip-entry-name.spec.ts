import { describe, expect, it } from 'vitest';
import { archiveDownloadFileName, uniqueZipEntryName } from './zip-entry-name';

describe('uniqueZipEntryName', () => {
  it('preserves nested folder paths', () => {
    const used = new Set<string>();
    expect(uniqueZipEntryName('SIS-14/ticket.pdf', used)).toBe('SIS-14/ticket.pdf');
    expect(uniqueZipEntryName('CE-20/OPEX.xlsx', used)).toBe('CE-20/OPEX.xlsx');
  });

  it('dedupes colliding paths with a numeric suffix before the extension', () => {
    const used = new Set<string>();
    expect(uniqueZipEntryName('folder/a.pdf', used)).toBe('folder/a.pdf');
    expect(uniqueZipEntryName('folder/a.pdf', used)).toBe('folder/a (1).pdf');
    expect(uniqueZipEntryName('folder/a.pdf', used)).toBe('folder/a (2).pdf');
  });

  it('treats collisions as case-insensitive', () => {
    const used = new Set<string>();
    expect(uniqueZipEntryName('Folder/A.pdf', used)).toBe('Folder/A.pdf');
    expect(uniqueZipEntryName('folder/a.pdf', used)).toBe('folder/a (1).pdf');
  });
});

describe('archiveDownloadFileName', () => {
  it('sanitizes invoice numbers for Content-Disposition', () => {
    expect(archiveDownloadFileName('J26-870')).toBe('J26-870-documents.zip');
    expect(archiveDownloadFileName('inv/../weird name')).toBe('inv_weird_name-documents.zip');
  });
});
