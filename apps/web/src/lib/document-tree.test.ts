import { describe, expect, it } from 'vitest';
import {
  buildDocumentTree,
  defaultExpandedFolderPaths,
  folderPathsForDocumentIds,
} from './document-tree';

describe('buildDocumentTree', () => {
  it('nests files under folder segments and sorts folders before files', () => {
    const tree = buildDocumentTree([
      { id: '1', fileName: 'root.pdf' },
      { id: '2', fileName: 'A/b/file.txt' },
      { id: '3', fileName: 'A/other.pdf' },
      { id: '4', fileName: 'B/nested/x.xlsx' },
    ]);

    expect(tree.map((n) => n.name)).toEqual(['A', 'B', 'root.pdf']);
    expect(tree[0]).toMatchObject({ kind: 'folder', path: 'A', fileCount: 2 });
    expect(tree[1]).toMatchObject({ kind: 'folder', path: 'B', fileCount: 1 });
    expect(tree[2]).toMatchObject({ kind: 'file', name: 'root.pdf' });

    const a = tree[0];
    if (a?.kind !== 'folder') throw new Error('expected folder A');
    expect(a.children.map((n) => n.name)).toEqual(['b', 'other.pdf']);
  });

  it('ignores empty / traversal segments', () => {
    const tree = buildDocumentTree([{ id: '1', fileName: 'a/../b/./c.pdf' }]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: 'folder', path: 'a' });
  });
});

describe('folderPathsForDocumentIds', () => {
  it('returns ancestor folder paths for matching files', () => {
    const tree = buildDocumentTree([
      { id: 'hit', fileName: 'A/b/c.pdf' },
      { id: 'other', fileName: 'A/x.pdf' },
    ]);
    const open = folderPathsForDocumentIds(tree, new Set(['hit']));
    expect([...open].sort()).toEqual(['A', 'A/b']);
  });
});

describe('defaultExpandedFolderPaths', () => {
  it('expands only top-level folders', () => {
    const tree = buildDocumentTree([
      { id: '1', fileName: 'A/b/c.pdf' },
      { id: '2', fileName: 'B/d.pdf' },
    ]);
    expect([...defaultExpandedFolderPaths(tree)].sort()).toEqual(['A', 'B']);
  });
});
